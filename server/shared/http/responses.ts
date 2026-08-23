import type { Response } from 'express';
import {
  ApiError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from './errors.ts';

export function handleApiError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const parserErrorType = getParserErrorType(error);
  if (parserErrorType === 'entity.too.large') {
    const mapped = new PayloadTooLargeError();
    res.status(mapped.statusCode).json({ error: mapped.message });
    return;
  }
  if (parserErrorType === 'encoding.unsupported') {
    const mapped = new UnsupportedMediaTypeError('Unsupported content encoding');
    res.status(mapped.statusCode).json({ error: mapped.message });
    return;
  }
  if (parserErrorType === 'entity.parse.failed') {
    const mapped = new ValidationError('Malformed JSON body');
    res.status(mapped.statusCode).json({ error: mapped.message });
    return;
  }

  const exposedClientError = getExposedClientError(error);
  if (exposedClientError) {
    res.status(exposedClientError.statusCode).json({ error: exposedClientError.message });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}

export function sendError(res: Response, error: ApiError): void {
  res.status(error.statusCode).json({ error: error.message });
}

function getParserErrorType(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('type' in error)) return undefined;
  return typeof error.type === 'string' ? error.type : undefined;
}

function getExposedClientError(
  error: unknown,
): { statusCode: number; message: string } | undefined {
  if (!error || typeof error !== 'object' || !('expose' in error) || error.expose !== true) {
    return undefined;
  }

  const status = 'status' in error && Number.isInteger(error.status)
    ? Number(error.status)
    : undefined;
  const statusCode = 'statusCode' in error && Number.isInteger(error.statusCode)
    ? Number(error.statusCode)
    : undefined;
  if (status !== undefined && statusCode !== undefined && status !== statusCode) return undefined;

  const resolvedStatus = statusCode ?? status;
  if (resolvedStatus === undefined || resolvedStatus < 400 || resolvedStatus > 499) return undefined;
  const message = 'message' in error && typeof error.message === 'string' && error.message
    ? error.message
    : 'Client request failed';
  return { statusCode: resolvedStatus, message };
}
