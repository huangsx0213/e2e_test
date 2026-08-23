import express, {
  Router,
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

import {
  PayloadTooLargeError,
  RequestTimeoutError,
  TooManyRequestsError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../../../shared/http/errors.ts';
import { Semaphore } from '../infra/semaphore.ts';
import {
  HTML_UPLOAD_BODY_TIMEOUT_MS,
  MAX_HTML_PAGE_BYTES,
  MAX_HTML_PARSE_CONCURRENCY,
  MAX_HTML_UPLOADS_PER_MINUTE,
  type HtmlKnowledgeManifest,
  type HtmlKnowledgePageDto,
  type HtmlKnowledgeSetDto,
} from './types.ts';

type Awaitable<T> = T | Promise<T>;

export interface HtmlKnowledgeApiService {
  createSet(projectId: string, manifest: HtmlKnowledgeManifest): Awaitable<HtmlKnowledgeSetDto>;
  getSet(projectId: string, setId: string): Awaitable<HtmlKnowledgeSetDto>;
  assertPageUploadAllowed(projectId: string, setId: string, pageId: string): Awaitable<void>;
  failPreflightedPageUpload(
    projectId: string,
    setId: string,
    pageId: string,
    error: Error,
  ): Awaitable<void>;
  uploadPage(
    projectId: string,
    setId: string,
    pageId: string,
    rawBytes: Uint8Array,
  ): Awaitable<HtmlKnowledgePageDto>;
  removePage(projectId: string, setId: string, pageId: string): Awaitable<HtmlKnowledgeSetDto>;
  deleteUnboundSet(projectId: string, setId: string): Awaitable<void>;
  finalizeSet(projectId: string, setId: string): Awaitable<HtmlKnowledgeSetDto>;
}

interface ParseSemaphore {
  tryAcquire(): boolean;
  release(): void;
}

export interface HtmlUploadRateLimiter {
  consume(ip: string): boolean;
}

export interface HtmlKnowledgeRouterOptions {
  readonly parseSemaphore?: ParseSemaphore;
  readonly uploadRateLimiter?: HtmlUploadRateLimiter;
  readonly resolveClientIp?: (req: Request) => string;
  readonly uploadBodyTimeoutMs?: number;
}

interface HtmlUploadRateLimiterTestControls extends HtmlUploadRateLimiter {
  resetForTests(): void;
  disposeForTests(): void;
}

const UPLOAD_RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_UPLOAD_CLIENTS = 10_000;

interface ParseSlotLease {
  serviceStarted: boolean;
  release(): void;
}

class FixedWindowHtmlUploadRateLimiter implements HtmlUploadRateLimiterTestControls {
  private readonly counts = new Map<string, number>();
  private activeWindow: number | undefined;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxTrackedClients = MAX_TRACKED_UPLOAD_CLIENTS,
  ) {}

  consume(ip: string): boolean {
    const window = Math.floor(this.now() / UPLOAD_RATE_WINDOW_MS);
    if (this.activeWindow !== window) {
      this.counts.clear();
      this.activeWindow = window;
    }
    const current = this.counts.get(ip);
    if (current === undefined) {
      if (this.counts.size >= this.maxTrackedClients) return false;
      this.counts.set(ip, 1);
      return true;
    }
    if (current >= MAX_HTML_UPLOADS_PER_MINUTE) return false;
    this.counts.set(ip, current + 1);
    return true;
  }

  resetForTests(): void {
    this.counts.clear();
    this.activeWindow = undefined;
  }

  disposeForTests(): void {
    this.resetForTests();
  }
}

const globalParseSemaphore = new Semaphore(MAX_HTML_PARSE_CONCURRENCY);
const globalUploadRateLimiter = new FixedWindowHtmlUploadRateLimiter();

export function createHtmlUploadRateLimiterForTests(
  now: () => number = Date.now,
  maxTrackedClients = MAX_TRACKED_UPLOAD_CLIENTS,
): HtmlUploadRateLimiterTestControls {
  return new FixedWindowHtmlUploadRateLimiter(now, maxTrackedClients);
}

export function createHtmlKnowledgeRouter(
  service: HtmlKnowledgeApiService,
  options: HtmlKnowledgeRouterOptions = {},
): Router {
  const router = Router({ mergeParams: true });
  const parseSemaphore = options.parseSemaphore ?? globalParseSemaphore;
  const uploadRateLimiter = options.uploadRateLimiter ?? globalUploadRateLimiter;
  const resolveClientIp = options.resolveClientIp
    ?? ((req: Request) => req.ip ?? 'unknown');
  const uploadBodyTimeoutMs = options.uploadBodyTimeoutMs ?? HTML_UPLOAD_BODY_TIMEOUT_MS;
  const parseRawHtml = withBodyReceiveDeadline(
    express.raw({ type: () => true, limit: MAX_HTML_PAGE_BYTES, inflate: false }),
    uploadBodyTimeoutMs,
  );
  const parseSlotLeases = new WeakMap<Request, ParseSlotLease>();
  const preflightedUploads = new WeakSet<Request>();

  router.post('/', asyncRoute(async (req, res) => {
    const result = await service.createSet(
      parameter(req, 'projectId'),
      req.body as HtmlKnowledgeManifest,
    );
    res.status(201).json(result);
  }));

  router.get('/:setId', asyncRoute(async (req, res) => {
    const result = await service.getSet(
      parameter(req, 'projectId'),
      parameter(req, 'setId'),
    );
    res.status(200).json(result);
  }));

  const preflightUpload: RequestHandler = (req, _res, next) => {
    Promise.resolve(service.assertPageUploadAllowed(
      parameter(req, 'projectId'),
      parameter(req, 'setId'),
      parameter(req, 'pageId'),
    )).then(() => {
      preflightedUploads.add(req);
      next();
    }, next);
  };

  const requireIdentityEncoding: RequestHandler = (req, _res, next) => {
    const contentEncoding = req.get('content-encoding');
    if (contentEncoding && contentEncoding.trim().toLowerCase() !== 'identity') {
      next(new UnsupportedMediaTypeError('HTML page uploads do not support content encoding'));
      return;
    }
    next();
  };

  const requireHtmlMediaType: RequestHandler = (req, _res, next) => {
    if (!isSupportedHtmlContentType(req.get('content-type'))) {
      next(new UnsupportedMediaTypeError(
        'HTML page upload Content-Type must be text/html with UTF-8 charset',
      ));
      return;
    }
    next();
  };

  const enforceUploadRate: RequestHandler = (req, _res, next) => {
    if (!uploadRateLimiter.consume(resolveClientIp(req))) {
      next(new TooManyRequestsError('HTML page upload rate limit exceeded'));
      return;
    }
    next();
  };

  const acquireParseSlot: RequestHandler = (req, res, next) => {
    if (!parseSemaphore.tryAcquire()) {
      next(new TooManyRequestsError('HTML page parsing is at capacity'));
      return;
    }

    const lease: ParseSlotLease = {
      serviceStarted: false,
      release: () => {
        if (!parseSlotLeases.delete(req)) return;
        parseSemaphore.release();
      },
    };
    const releaseBeforeService = () => {
      if (!lease.serviceStarted) lease.release();
    };
    parseSlotLeases.set(req, lease);
    req.once('aborted', releaseBeforeService);
    res.once('close', releaseBeforeService);
    next();
  };

  const requireRawBuffer: RequestHandler = (req, _res, next) => {
    if (req.body === undefined) req.body = Buffer.alloc(0);
    if (!Buffer.isBuffer(req.body)) {
      next(new ValidationError('HTML page upload body must contain raw bytes'));
      return;
    }
    next();
  };

  const releaseOnError: ErrorRequestHandler = (error, req, _res, next) => {
    parseSlotLeases.get(req)?.release();
    const uploadError = toPersistedPreflightError(error);
    if (!preflightedUploads.delete(req) || !uploadError) {
      next(error);
      return;
    }
    Promise.resolve().then(() => service.failPreflightedPageUpload(
      parameter(req, 'projectId'),
      parameter(req, 'setId'),
      parameter(req, 'pageId'),
      uploadError,
    )).then(() => next(uploadError), next);
  };

  router.put(
    '/:setId/pages/:pageId',
    preflightUpload,
    requireIdentityEncoding,
    requireHtmlMediaType,
    enforceUploadRate,
    acquireParseSlot,
    parseRawHtml,
    requireRawBuffer,
    asyncRoute(async (req, res) => {
      const lease = parseSlotLeases.get(req);
      if (!lease) return;
      preflightedUploads.delete(req);
      lease.serviceStarted = true;
      try {
        const result = await service.uploadPage(
          parameter(req, 'projectId'),
          parameter(req, 'setId'),
          parameter(req, 'pageId'),
          req.body as Buffer,
        );
        res.status(200).json(result);
      } finally {
        lease.release();
      }
    }),
    releaseOnError,
  );

  router.delete('/:setId/pages/:pageId', asyncRoute(async (req, res) => {
    const result = await service.removePage(
      parameter(req, 'projectId'),
      parameter(req, 'setId'),
      parameter(req, 'pageId'),
    );
    res.status(200).json(result);
  }));

  router.delete('/:setId', asyncRoute(async (req, res) => {
    await service.deleteUnboundSet(
      parameter(req, 'projectId'),
      parameter(req, 'setId'),
    );
    res.status(200).json({ success: true });
  }));

  router.post('/:setId/finalize', asyncRoute(async (req, res) => {
    const result = await service.finalizeSet(
      parameter(req, 'projectId'),
      parameter(req, 'setId'),
    );
    res.status(200).json(result);
  }));

  return router;
}

function asyncRoute(
  handler: (req: Request, res: Response) => Awaitable<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve().then(() => handler(req, res)).catch(next);
  };
}

function withBodyReceiveDeadline(
  parser: RequestHandler,
  timeoutMs: number,
): RequestHandler {
  return (req, res, next) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      res.setHeader('Connection', 'close');
      req.resume();
      next(new RequestTimeoutError('HTML page upload body deadline exceeded'));
    }, timeoutMs);
    timer.unref();

    const finish: NextFunction = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      next(error);
    };

    try {
      parser(req, res, finish);
    } catch (error) {
      finish(error);
    }
  };
}

function parameter(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function isSupportedHtmlContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return /^text\/html(?:\s*;\s*charset\s*=\s*(?:"(?:utf-8|utf8)"|utf-8|utf8))?\s*$/iu
    .test(contentType);
}

function toPersistedPreflightError(error: unknown): Error | undefined {
  if (error instanceof UnsupportedMediaTypeError) return error;
  if (getErrorType(error) === 'entity.too.large') {
    return new PayloadTooLargeError('HTML page upload exceeds 512 KiB');
  }
  return undefined;
}

function getErrorType(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('type' in error)) return undefined;
  return typeof error.type === 'string' ? error.type : undefined;
}
