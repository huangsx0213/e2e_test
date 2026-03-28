import type { Response } from 'express';
import { ApiError } from './errors.ts';

export function handleApiError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const status = error instanceof ApiError ? error.statusCode : 500;
  res.status(status).json({ error: message });
}

export function sendError(res: Response, error: ApiError): void {
  res.status(error.statusCode).json({ error: error.message });
}
