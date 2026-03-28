import type { Request, Response } from 'express';

import { handleApiError } from './responses.ts';

type HandlerResult = void | Promise<void>;

export type HttpHandler<
  TRequest extends Request = Request,
  TResponse extends Response = Response,
> = (req: TRequest, res: TResponse) => HandlerResult;

export function withErrorHandling<
  TRequest extends Request = Request,
  TResponse extends Response = Response,
>(handler: HttpHandler<TRequest, TResponse>) {
  return async (req: TRequest, res: TResponse): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      handleApiError(res, error);
    }
  };
}
