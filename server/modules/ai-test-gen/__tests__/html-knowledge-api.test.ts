// @vitest-environment node
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createConnection, type AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../app/registerRoutes.ts', () => ({ registerRoutes: vi.fn() }));
vi.mock('../../../migrations/index.ts', () => ({ runMigrations: vi.fn() }));

import { createApp, resolveTrustProxySetting } from '../../../app/createApp.ts';
import { registerRoutes } from '../../../app/registerRoutes.ts';
import { ConflictError, NotFoundError } from '../../../shared/http/errors.ts';
import { handleApiError } from '../../../shared/http/responses.ts';
import { createResumeRunHandler } from '../index.ts';
import {
  createHtmlKnowledgeRouter,
  createHtmlUploadRateLimiterForTests,
  type HtmlKnowledgeApiService,
  type HtmlKnowledgeRouterOptions,
} from '../html-knowledge/router.ts';
import type {
  HtmlKnowledgePageDto,
  HtmlKnowledgeSetDto,
} from '../html-knowledge/types.ts';
import { HTML_UPLOAD_BODY_TIMEOUT_MS } from '../html-knowledge/types.ts';

const pageDto: HtmlKnowledgePageDto = {
  pageId: 'page-1',
  fileName: 'login.html',
  expectedByteSize: 15,
  status: 'READY',
  errorMessage: null,
  pageTitle: 'Sign in',
  byteSize: 15,
  informationLevel: 'NORMAL',
  warnings: [],
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
};

const setDto: HtmlKnowledgeSetDto = {
  knowledgeSetId: 'set-1',
  status: 'UPLOADING',
  pageCount: 1,
  totalBytes: 15,
  indexVersion: 1,
  pages: [pageDto],
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
};

function createFakeService() {
  return {
    createSet: vi.fn(() => setDto),
    getSet: vi.fn(() => setDto),
    assertPageUploadAllowed: vi.fn((
      _projectId: string,
      _setId: string,
      _pageId: string,
    ) => undefined),
    failPreflightedPageUpload: vi.fn((
      _projectId: string,
      _setId: string,
      _pageId: string,
      error: Error,
    ): never => { throw error; }),
    uploadPage: vi.fn((
      _projectId: string,
      _setId: string,
      _pageId: string,
      _rawBytes: Uint8Array,
    ): HtmlKnowledgePageDto | Promise<HtmlKnowledgePageDto> => pageDto),
    removePage: vi.fn(() => setDto),
    deleteUnboundSet: vi.fn(() => undefined),
    finalizeSet: vi.fn(() => ({ ...setDto, status: 'READY' as const })),
  } satisfies HtmlKnowledgeApiService;
}

class TrackingSemaphore {
  active = 0;
  releaseCount = 0;

  constructor(private readonly maximum = 1) {}

  tryAcquire(): boolean {
    if (this.active >= this.maximum) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    this.releaseCount += 1;
    if (this.active > 0) this.active -= 1;
  }
}

const servers = new Set<Server>();

beforeEach(() => {
  vi.mocked(registerRoutes).mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await Promise.all([...servers].map(async (server) => {
    server.closeAllConnections?.();
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    servers.delete(server);
  }));
});

function addJsonErrorMiddleware(app: Express): void {
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    handleApiError(res, error);
  });
}

async function startApp(app: Express): Promise<{ baseUrl: string; server: Server }> {
  const server = app.listen(0, '127.0.0.1');
  servers.add(server);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function startApi(
  service: HtmlKnowledgeApiService,
  options: HtmlKnowledgeRouterOptions = {},
): Promise<{ baseUrl: string; server: Server }> {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/test-gen/:projectId/html-knowledge-sets',
    createHtmlKnowledgeRouter(service, options),
  );
  addJsonErrorMiddleware(app);
  return startApp(app);
}

async function readJson(response: globalThis.Response): Promise<Record<string, unknown>> {
  expect(response.headers.get('content-type')).toContain('application/json');
  return response.json() as Promise<Record<string, unknown>>;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function beginPartialUpload(baseUrl: string, contentLength = 100, writeBody = true) {
  const url = new URL(
    '/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1',
    baseUrl,
  );
  const request = httpRequest({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'PUT',
    headers: {
      'content-type': 'text/html',
      'content-length': String(contentLength),
    },
  });
  request.on('error', () => undefined);
  const closed = new Promise<void>((resolve) => request.once('close', resolve));
  const response = new Promise<{
    statusCode: number;
    contentType: string | undefined;
    body: string;
  }>((resolve) => {
    request.once('response', (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.once('end', () => resolve({
        statusCode: incoming.statusCode ?? 0,
        contentType: incoming.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
  });
  if (writeBody) request.write('<');
  else request.flushHeaders();
  return { request, response, closed };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

async function sendUnframedHtmlPut(baseUrl: string): Promise<string> {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const socket = createConnection(Number(url.port), url.hostname);
    let response = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    socket.setEncoding('latin1');
    socket.on('data', (chunk) => { response += chunk; });
    socket.once('error', reject);
    socket.once('end', finish);
    socket.once('close', finish);
    socket.once('connect', () => {
      socket.write([
        'PUT /api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1 HTTP/1.1',
        `Host: ${url.host}`,
        'Content-Type: text/html',
        'Connection: close',
        '',
        '',
      ].join('\r\n'));
    });
  });
}

describe('HTML knowledge API', () => {
  it('returns synchronous resume preflight errors through the HTTP route', async () => {
    const resumeController = {
      resumeRun: vi.fn(() => {
        throw new ConflictError('Test gen is not waiting for review');
      }),
    };
    const app = express();
    app.use(express.json());
    app.post('/api/test-gen/:runId/resume', createResumeRunHandler(resumeController));
    addJsonErrorMiddleware(app);
    const { baseUrl } = await startApp(app);

    const response = await fetch(`${baseUrl}/api/test-gen/run-1/resume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });

    expect(response.status).toBe(409);
    expect(await readJson(response)).toEqual({
      error: 'Test gen is not waiting for review',
    });
    expect(resumeController.resumeRun).toHaveBeenCalledWith('run-1', { action: 'approve' });
  });

  it('parses explicit proxy settings and uses deployment-safe defaults', () => {
    expect(resolveTrustProxySetting(undefined, 'test')).toBe(false);
    expect(resolveTrustProxySetting(undefined, 'production'))
      .toBe('loopback, linklocal, uniquelocal');
    expect(resolveTrustProxySetting('false', 'production')).toBe(false);
    expect(resolveTrustProxySetting('true', 'test')).toBe(true);
    expect(resolveTrustProxySetting('2', 'production')).toBe(2);
    expect(resolveTrustProxySetting('loopback, 10.0.0.0/8', 'production'))
      .toBe('loopback, 10.0.0.0/8');
  });

  it('ignores a client-supplied forwarded address when proxy trust is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRUST_PROXY', '');
    vi.mocked(registerRoutes).mockImplementation((app) => {
      app.get('/client-ip', (req, res) => res.json({ ip: req.ip, protocol: req.protocol }));
    });
    const app = createApp();
    const { baseUrl } = await startApp(app);

    const response = await fetch(`${baseUrl}/client-ip`, {
      headers: { 'x-forwarded-for': '198.51.100.200' },
    });
    const body = await readJson(response);

    expect(app.get('trust proxy')).toBe(false);
    expect(body.ip).not.toBe('198.51.100.200');
    expect(body.ip).toMatch(/127\.0\.0\.1$/u);
    expect(body.protocol).toBe('http');
  });

  it('trusts forwarded client and protocol values only through the production private proxy policy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', '');
    vi.mocked(registerRoutes).mockImplementation((app) => {
      app.get('/client-ip', (req, res) => res.json({ ip: req.ip, protocol: req.protocol }));
    });
    const app = createApp();
    const { baseUrl } = await startApp(app);

    const response = await fetch(`${baseUrl}/client-ip`, {
      headers: {
        'x-forwarded-for': '198.51.100.200',
        'x-forwarded-proto': 'https',
      },
    });

    expect(app.get('trust proxy')).toBe('loopback, linklocal, uniquelocal');
    expect(await readJson(response)).toEqual({
      ip: '198.51.100.200',
      protocol: 'https',
    });
  });

  it('uses the verified Express client IP for the production limiter key', async () => {
    const service = createFakeService();
    const uploadRateLimiter = { consume: vi.fn(() => true) };
    const app = express();
    app.set('trust proxy', 'loopback');
    app.use(
      '/api/test-gen/:projectId/html-knowledge-sets',
      createHtmlKnowledgeRouter(service, { uploadRateLimiter }),
    );
    addJsonErrorMiddleware(app);
    const { baseUrl } = await startApp(app);

    const response = await fetch(
      `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'text/html',
          'x-forwarded-for': '198.51.100.201',
        },
        body: '<h1>Trusted proxy</h1>',
      },
    );

    expect(response.status).toBe(200);
    await response.body?.cancel();
    expect(uploadRateLimiter.consume).toHaveBeenCalledWith('198.51.100.201');
  });

  it('lets malformed JSON page PUTs reach ownership and media checks in the real app order', async () => {
    const service = createFakeService();
    service.assertPageUploadAllowed.mockImplementation((projectId, setId) => {
      if (projectId !== 'project-1' || setId !== 'set-1') {
        throw new NotFoundError('HTML knowledge page not found');
      }
    });
    vi.mocked(registerRoutes).mockImplementation((app) => {
      app.use(
        '/api/test-gen/:projectId/html-knowledge-sets',
        createHtmlKnowledgeRouter(service),
      );
    });
    const { baseUrl } = await startApp(createApp());

    const missingSet = await fetch(
      `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/missing/pages/page-1`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
    );
    expect(missingSet.status).toBe(404);
    expect(await readJson(missingSet)).toEqual({ error: 'HTML knowledge page not found' });

    const wrongProject = await fetch(
      `${baseUrl}/api/test-gen/project-2/html-knowledge-sets/set-1/pages/page-1`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
    );
    expect(wrongProject.status).toBe(404);
    expect(await readJson(wrongProject)).toEqual({ error: 'HTML knowledge page not found' });

    const wrongMediaType = await fetch(
      `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
    );
    expect(wrongMediaType.status).toBe(415);
    expect(await readJson(wrongMediaType)).toEqual({ error: expect.any(String) });
    expect(service.assertPageUploadAllowed).toHaveBeenCalledTimes(3);
    expect(service.failPreflightedPageUpload).toHaveBeenCalledTimes(1);
    expect(service.failPreflightedPageUpload.mock.calls[0].slice(0, 3)).toEqual([
      'project-1',
      'set-1',
      'page-1',
    ]);
    expect(service.uploadPage).not.toHaveBeenCalled();
  });

  it('keeps normal JSON parsing intact and reports malformed JSON as a safe 400', async () => {
    vi.mocked(registerRoutes).mockImplementation((app) => {
      app.put('/ordinary-json', (req, res) => res.json({ body: req.body }));
    });
    const { baseUrl } = await startApp(createApp());

    const valid = await fetch(`${baseUrl}/ordinary-json`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 42 }),
    });
    expect(valid.status).toBe(200);
    expect(await readJson(valid)).toEqual({ body: { value: 42 } });

    const malformed = await fetch(`${baseUrl}/ordinary-json`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await readJson(malformed)).toEqual({ error: 'Malformed JSON body' });
  });

  it('honors exposed body-parser and standard 4xx errors while redacting 5xx details', async () => {
    vi.mocked(registerRoutes).mockImplementation((app) => {
      app.put('/ordinary-json', (req, res) => res.json({ body: req.body }));
      app.get('/status-client-error', (_req, _res, next) => {
        next(Object.assign(new Error('Safe client detail'), {
          status: 409,
          expose: true,
          type: 'request.conflict',
        }));
      });
      app.get('/status-code-client-error', (_req, _res, next) => {
        next(Object.assign(new Error('Safe validation detail'), {
          statusCode: 422,
          expose: true,
          type: 'entity.verify.failed',
        }));
      });
      app.get('/server-error', (_req, _res, next) => {
        next(Object.assign(new Error('database host secret'), {
          status: 503,
          statusCode: 503,
          expose: true,
        }));
      });
    });
    const { baseUrl } = await startApp(createApp());

    const unsupportedCharset = await fetch(`${baseUrl}/ordinary-json`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json; charset=iso-8859-1' },
      body: '{}',
    });
    expect(unsupportedCharset.status).toBe(415);
    expect(await readJson(unsupportedCharset)).toEqual({
      error: expect.stringMatching(/unsupported charset/i),
    });

    const statusError = await fetch(`${baseUrl}/status-client-error`);
    expect(statusError.status).toBe(409);
    expect(await readJson(statusError)).toEqual({ error: 'Safe client detail' });

    const statusCodeError = await fetch(`${baseUrl}/status-code-client-error`);
    expect(statusCodeError.status).toBe(422);
    expect(await readJson(statusCodeError)).toEqual({ error: 'Safe validation detail' });

    const serverError = await fetch(`${baseUrl}/server-error`);
    expect(serverError.status).toBe(500);
    expect(await readJson(serverError)).toEqual({ error: 'Internal server error' });
  });

  it('serves all six project-scoped routes with their required statuses and arguments', async () => {
    const service = createFakeService();
    const { baseUrl } = await startApi(service);
    const root = `${baseUrl}/api/test-gen/project-1/html-knowledge-sets`;
    const manifest = { pages: [{ fileName: 'login.html', byteSize: 15 }] };

    const created = await fetch(root, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(manifest),
    });
    expect(created.status).toBe(201);
    expect(await readJson(created)).toEqual(setDto);

    const loaded = await fetch(`${root}/set-1`);
    expect(loaded.status).toBe(200);
    const loadedBody = await readJson(loaded);
    expect(loadedBody).toEqual(setDto);
    expect(JSON.stringify(loadedBody)).not.toMatch(
      /normalized_html|normalizedHtml|knowledge_index|knowledgeIndex|requirement_snapshot|requirementSnapshot|sha256/i,
    );

    const rawBytes = Buffer.from([
      0x3c, 0x68, 0x31, 0x3e, 0x43, 0x61, 0x66, 0xc3, 0xa9, 0x3c, 0x2f, 0x68, 0x31, 0x3e,
    ]);
    const uploaded = await fetch(`${root}/set-1/pages/page-1`, {
      method: 'PUT',
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-encoding': 'identity',
      },
      body: rawBytes,
    });
    expect(uploaded.status).toBe(200);
    expect(await readJson(uploaded)).toEqual(pageDto);

    const removedPage = await fetch(`${root}/set-1/pages/page-1`, { method: 'DELETE' });
    expect(removedPage.status).toBe(200);
    expect(await readJson(removedPage)).toEqual(setDto);

    const finalized = await fetch(`${root}/set-1/finalize`, { method: 'POST' });
    expect(finalized.status).toBe(200);
    expect(await readJson(finalized)).toMatchObject({
      knowledgeSetId: 'set-1',
      status: 'READY',
    });

    const deleted = await fetch(`${root}/set-1`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(await readJson(deleted)).toEqual({ success: true });

    expect(service.createSet).toHaveBeenCalledWith('project-1', manifest);
    expect(service.getSet).toHaveBeenCalledWith('project-1', 'set-1');
    expect(service.assertPageUploadAllowed).toHaveBeenCalledWith(
      'project-1',
      'set-1',
      'page-1',
    );
    expect(service.uploadPage).toHaveBeenCalledTimes(1);
    const uploadedBytes = service.uploadPage.mock.calls[0][3];
    expect(Buffer.isBuffer(uploadedBytes)).toBe(true);
    expect(Buffer.compare(uploadedBytes as Buffer, rawBytes)).toBe(0);
    expect(service.uploadPage.mock.calls[0].slice(0, 3)).toEqual([
      'project-1',
      'set-1',
      'page-1',
    ]);
    expect(service.removePage).toHaveBeenCalledWith('project-1', 'set-1', 'page-1');
    expect(service.finalizeSet).toHaveBeenCalledWith('project-1', 'set-1');
    expect(service.deleteUnboundSet).toHaveBeenCalledWith('project-1', 'set-1');
  });

  it('returns an ownership-safe 404 from upload preflight before request validation', async () => {
    const service = createFakeService();
    service.assertPageUploadAllowed.mockImplementation(() => {
      throw new NotFoundError('HTML knowledge set not found');
    });
    const { baseUrl } = await startApi(service);

    const response = await fetch(
      `${baseUrl}/api/test-gen/other-project/html-knowledge-sets/set-1/pages/page-1`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/xhtml+xml' },
        body: '<h1>Must not be parsed</h1>',
      },
    );

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({ error: 'HTML knowledge set not found' });
    expect(service.assertPageUploadAllowed).toHaveBeenCalledWith(
      'other-project',
      'set-1',
      'page-1',
    );
    expect(service.failPreflightedPageUpload).not.toHaveBeenCalled();
    expect(service.uploadPage).not.toHaveBeenCalled();
  });

  it('rejects wrong media types and compressed uploads before acquiring a parse slot', async () => {
    const service = createFakeService();
    const semaphore = new TrackingSemaphore();
    const { baseUrl } = await startApi(service, { parseSemaphore: semaphore });
    const url = `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`;

    const wrongType = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/xhtml+xml' },
      body: '<h1>Wrong type</h1>',
    });
    expect(wrongType.status).toBe(415);
    expect(await readJson(wrongType)).toEqual({ error: expect.any(String) });

    const compressed = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'text/html',
        'content-encoding': 'gzip',
      },
      body: '<h1>Not actually compressed</h1>',
    });
    expect(compressed.status).toBe(415);
    expect(await readJson(compressed)).toEqual({ error: expect.any(String) });

    expect(semaphore.active).toBe(0);
    expect(semaphore.releaseCount).toBe(0);
    expect(service.failPreflightedPageUpload).toHaveBeenCalledTimes(2);
    expect(service.failPreflightedPageUpload.mock.calls.map((call) => call.slice(0, 3)))
      .toEqual([
        ['project-1', 'set-1', 'page-1'],
        ['project-1', 'set-1', 'page-1'],
      ]);
    expect(service.uploadPage).not.toHaveBeenCalled();
  });

  it('accepts only text/html with zero or one UTF-8 charset parameter', async () => {
    const service = createFakeService();
    const semaphore = new TrackingSemaphore();
    const { baseUrl } = await startApi(service, { parseSemaphore: semaphore });
    const url = `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`;

    const validContentTypes = [
      'text/html',
      'text/html; charset=utf-8',
      'text/html; charset=utf8',
      'text/html; charset="UTF-8"',
    ];
    for (const contentType of validContentTypes) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: Buffer.from([0x78]),
      });
      expect(response.status, contentType).toBe(200);
      await response.body?.cancel();
    }

    const invalidContentTypes = [
      'text/html; charset=iso-8859-1',
      'text/html; charset=',
      'text/html; charset',
      'text/html; foo',
      'text/html; boundary=something',
      'text/html; charset=utf-8; charset=utf8',
      'text/html;',
    ];
    for (const contentType of invalidContentTypes) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: Buffer.from([0x79]),
      });
      expect(response.status, contentType).toBe(415);
      expect(await readJson(response)).toEqual({ error: expect.any(String) });
    }

    expect(service.uploadPage).toHaveBeenCalledTimes(validContentTypes.length);
    for (const call of service.uploadPage.mock.calls) {
      expect(Buffer.isBuffer(call[3])).toBe(true);
      expect(call[3]).toEqual(Buffer.from([0x78]));
    }
    expect(service.failPreflightedPageUpload)
      .toHaveBeenCalledTimes(invalidContentTypes.length);
    expect(service.failPreflightedPageUpload.mock.calls[0][3]).toMatchObject({
      statusCode: 415,
      message: expect.stringMatching(/UTF-8 charset/i),
    });
    expect(semaphore.releaseCount).toBe(validContentTypes.length);
  });

  it('returns a JSON 413 and releases admission after a 513 KiB body', async () => {
    const service = createFakeService();
    const semaphore = new TrackingSemaphore();
    const { baseUrl } = await startApi(service, { parseSemaphore: semaphore });

    const response = await fetch(
      `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`,
      {
        method: 'PUT',
        headers: { 'content-type': 'text/html' },
        body: Buffer.alloc(513 * 1024, 0x61),
      },
    );

    expect(response.status).toBe(413);
    expect(await readJson(response)).toEqual({ error: expect.any(String) });
    expect(semaphore.active).toBe(0);
    expect(semaphore.releaseCount).toBe(1);
    expect(service.failPreflightedPageUpload).toHaveBeenCalledTimes(1);
    expect(service.failPreflightedPageUpload.mock.calls[0][3]).toMatchObject({
      statusCode: 413,
      message: expect.stringMatching(/512 KiB/i),
    });
    expect(service.uploadPage).not.toHaveBeenCalled();
  });

  it('holds both admission slots for stalled bodies, then returns JSON 408 and releases once', async () => {
    const service = createFakeService();
    const semaphore = new TrackingSemaphore(2);
    const { baseUrl } = await startApi(service, {
      parseSemaphore: semaphore,
      uploadBodyTimeoutMs: 40,
    });
    const first = beginPartialUpload(baseUrl);
    const second = beginPartialUpload(baseUrl);

    await waitUntil(() => semaphore.active === 2);
    const responses = await Promise.all([first.response, second.response]);
    first.request.destroy();
    second.request.destroy();
    await Promise.all([first.closed, second.closed]);

    expect(HTML_UPLOAD_BODY_TIMEOUT_MS).toBe(30_000);
    for (const response of responses) {
      expect(response.statusCode).toBe(408);
      expect(response.contentType).toContain('application/json');
      expect(JSON.parse(response.body)).toEqual({ error: expect.any(String) });
    }
    expect(service.uploadPage).not.toHaveBeenCalled();
    expect(semaphore.active).toBe(0);
    expect(semaphore.releaseCount).toBe(2);
  });

  it('accepts an exact 512 KiB body under the upload deadline', async () => {
    const service = createFakeService();
    const semaphore = new TrackingSemaphore();
    const { baseUrl } = await startApi(service, {
      parseSemaphore: semaphore,
      uploadBodyTimeoutMs: 1_000,
    });
    const bytes = Buffer.alloc(512 * 1024, 0x61);

    const response = await fetch(
      `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`,
      {
        method: 'PUT',
        headers: { 'content-type': 'text/html' },
        body: bytes,
      },
    );

    expect(response.status).toBe(200);
    await response.body?.cancel();
    expect(service.uploadPage).toHaveBeenCalledTimes(1);
    expect(service.uploadPage.mock.calls[0][3]).toEqual(bytes);
    expect(semaphore.active).toBe(0);
    expect(semaphore.releaseCount).toBe(1);
  });

  it('passes an empty raw entity to the service as a zero-length Buffer', async () => {
    const service = createFakeService();
    const semaphore = new TrackingSemaphore();
    const { baseUrl } = await startApi(service, { parseSemaphore: semaphore });

    const response = await fetch(
      `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`,
      {
        method: 'PUT',
        headers: { 'content-type': 'text/html' },
      },
    );

    expect(response.status).toBe(200);
    await response.body?.cancel();
    expect(semaphore.releaseCount).toBe(1);
    const uploadedBytes = service.uploadPage.mock.calls[0][3];
    expect(Buffer.isBuffer(uploadedBytes)).toBe(true);
    expect((uploadedBytes as Buffer).byteLength).toBe(0);
  });

  it('treats an unframed text/html request as a zero-length Buffer', async () => {
    const service = createFakeService();
    const { baseUrl } = await startApi(service);

    const response = await sendUnframedHtmlPut(baseUrl);

    expect(response).toMatch(/^HTTP\/1\.1 200/u);
    expect(service.uploadPage).toHaveBeenCalledTimes(1);
    const uploadedBytes = service.uploadPage.mock.calls[0][3];
    expect(Buffer.isBuffer(uploadedBytes)).toBe(true);
    expect((uploadedBytes as Buffer).byteLength).toBe(0);
  });

  it('returns 429 from occupied admission slots without waiting for or consuming a body', async () => {
    const service = createFakeService();
    const semaphore = new TrackingSemaphore(2);
    expect(semaphore.tryAcquire()).toBe(true);
    expect(semaphore.tryAcquire()).toBe(true);
    const { baseUrl } = await startApi(service, { parseSemaphore: semaphore });

    const pending = beginPartialUpload(baseUrl, 100, false);
    const response = await Promise.race([
      pending.response,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 500)),
    ]);
    pending.request.destroy();
    await pending.closed;

    expect(response).toBeDefined();
    if (!response) return;
    expect(response.statusCode).toBe(429);
    expect(response.contentType).toContain('application/json');
    expect(JSON.parse(response.body)).toEqual({ error: expect.any(String) });
    expect(service.uploadPage).not.toHaveBeenCalled();
    expect(semaphore.active).toBe(2);
    semaphore.release();
    semaphore.release();
  });

  it('gives each forwarded client IP an independent 60-request fixed window', async () => {
    const service = createFakeService();
    let now = Date.parse('2026-08-21T12:00:00.000Z');
    const limiter = createHtmlUploadRateLimiterForTests(() => now);
    const { baseUrl } = await startApi(service, {
      uploadRateLimiter: limiter,
      resolveClientIp: (req) => req.get('x-forwarded-for') ?? 'unknown',
    });
    const url = `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`;

    for (let requestNumber = 1; requestNumber <= 60; requestNumber += 1) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'content-type': 'text/html',
          'x-forwarded-for': '198.51.100.10',
        },
        body: '<h1>Allowed</h1>',
      });
      expect(response.status, `client A request ${requestNumber}`).toBe(200);
      await response.body?.cancel();
    }

    const limited = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'text/html',
        'x-forwarded-for': '198.51.100.10',
      },
      body: '<h1>Limited</h1>',
    });
    expect(limited.status).toBe(429);
    expect(await readJson(limited)).toEqual({ error: expect.any(String) });
    expect(service.uploadPage).toHaveBeenCalledTimes(60);

    for (let requestNumber = 1; requestNumber <= 60; requestNumber += 1) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'content-type': 'text/html',
          'x-forwarded-for': '203.0.113.20',
        },
        body: '<h1>Other client</h1>',
      });
      expect(response.status, `client B request ${requestNumber}`).toBe(200);
      await response.body?.cancel();
    }
    const otherClientLimited = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'text/html',
        'x-forwarded-for': '203.0.113.20',
      },
      body: '<h1>Other client limited</h1>',
    });
    expect(otherClientLimited.status).toBe(429);
    await otherClientLimited.body?.cancel();
    expect(service.uploadPage).toHaveBeenCalledTimes(120);

    now += 60_000;
    const nextWindow = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'text/html',
        'x-forwarded-for': '198.51.100.10',
      },
      body: '<h1>Allowed next minute</h1>',
    });
    expect(nextWindow.status).toBe(200);
    await nextWindow.body?.cancel();

    limiter.resetForTests();
    const afterReset = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'text/html',
        'x-forwarded-for': '198.51.100.10',
      },
      body: '<h1>Allowed after reset</h1>',
    });
    expect(afterReset.status).toBe(200);
    await afterReset.body?.cancel();

    limiter.disposeForTests();
  });

  it('bounds tracked client IPs and clears stale entries without cleanup timers', () => {
    vi.useFakeTimers();
    let now = 1_000;
    const limiter = createHtmlUploadRateLimiterForTests(() => now, 2);

    expect(limiter.consume('client-a')).toBe(true);
    expect(limiter.consume('client-b')).toBe(true);
    expect(limiter.consume('client-c')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    now += 60_000;
    expect(limiter.consume('client-c')).toBe(true);
    limiter.disposeForTests();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the parse slot once after a service error and hides internal details', async () => {
    const service = createFakeService();
    service.uploadPage
      .mockImplementationOnce(() => {
        throw new Error('database password and stack detail');
      })
      .mockImplementationOnce(() => pageDto);
    const semaphore = new TrackingSemaphore();
    const { baseUrl } = await startApi(service, { parseSemaphore: semaphore });
    const url = `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`;

    const failed = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: '<h1>First</h1>',
    });
    expect(failed.status).toBe(500);
    expect(await readJson(failed)).toEqual({ error: 'Internal server error' });
    expect(semaphore.active).toBe(0);
    expect(semaphore.releaseCount).toBe(1);

    const retried = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: '<h1>Second</h1>',
    });
    expect(retried.status).toBe(200);
    await retried.body?.cancel();
    expect(semaphore.active).toBe(0);
    expect(semaphore.releaseCount).toBe(2);
  });

  it('releases one acquired slot and does not call the service when the client aborts mid-body', async () => {
    const service = createFakeService();
    const semaphore = new TrackingSemaphore();
    const { baseUrl } = await startApi(service, { parseSemaphore: semaphore });
    const partial = beginPartialUpload(baseUrl);

    await waitUntil(() => semaphore.active === 1);
    partial.request.destroy();
    await partial.closed;
    await waitUntil(() => semaphore.active === 0);

    expect(semaphore.active).toBe(0);
    expect(semaphore.releaseCount).toBe(1);
    expect(service.uploadPage).not.toHaveBeenCalled();

    const retried = await fetch(
      `${baseUrl}/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1`,
      {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: '<h1>After abort</h1>',
      },
    );
    expect(retried.status).toBe(200);
    await retried.body?.cancel();
    expect(semaphore.releaseCount).toBe(2);
  });

  it('holds the parse slot after response close until deferred service work settles', async () => {
    const service = createFakeService();
    const pendingUpload = deferred<HtmlKnowledgePageDto>();
    service.uploadPage.mockImplementation(() => pendingUpload.promise);
    const semaphore = new TrackingSemaphore();
    const { baseUrl } = await startApi(service, { parseSemaphore: semaphore });
    const url = new URL(
      '/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1',
      baseUrl,
    );
    const rawBytes = Buffer.from('<h1>Deferred</h1>');
    const request = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'PUT',
      headers: {
        'content-type': 'text/html',
        'content-length': String(rawBytes.byteLength),
      },
    });
    request.on('error', () => undefined);
    const closed = new Promise<void>((resolve) => request.once('close', resolve));
    request.end(rawBytes);

    await waitUntil(() => service.uploadPage.mock.calls.length === 1);
    expect(semaphore.active).toBe(1);
    request.destroy();
    await closed;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const activeAfterClose = semaphore.active;

    pendingUpload.resolve(pageDto);
    await waitUntil(() => semaphore.active === 0);

    expect(activeAfterClose).toBe(1);
    expect(semaphore.releaseCount).toBe(1);
  });

  it('maps body-parser size and encoding errors to JSON without exposing parser details', async () => {
    const app = express();
    app.post(
      '/parse',
      express.raw({ type: 'text/html', limit: 8, inflate: false }),
      (_req, res) => res.json({ ok: true }),
    );
    addJsonErrorMiddleware(app);
    const { baseUrl } = await startApp(app);

    const tooLarge = await fetch(`${baseUrl}/parse`, {
      method: 'POST',
      headers: { 'content-type': 'text/html' },
      body: '123456789',
    });
    expect(tooLarge.status).toBe(413);
    expect(await readJson(tooLarge)).toEqual({ error: expect.any(String) });

    const unsupportedEncoding = await fetch(`${baseUrl}/parse`, {
      method: 'POST',
      headers: {
        'content-type': 'text/html',
        'content-encoding': 'gzip',
      },
      body: 'plain text',
    });
    expect(unsupportedEncoding.status).toBe(415);
    expect(await readJson(unsupportedEncoding)).toEqual({ error: expect.any(String) });
  });
});
