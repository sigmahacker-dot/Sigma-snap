import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** Application error with a machine-readable code and HTTP status. */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new ApiError(400, code, message, details);
export const unauthorized = (code: string, message: string, details?: unknown) =>
  new ApiError(401, code, message, details);
export const forbidden = (code: string, message: string, details?: unknown) =>
  new ApiError(403, code, message, details);
export const notFound = (code: string, message: string, details?: unknown) =>
  new ApiError(404, code, message, details);
export const conflict = (code: string, message: string, details?: unknown) =>
  new ApiError(409, code, message, details);
export const gone = (code: string, message: string, details?: unknown) =>
  new ApiError(410, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new ApiError(422, code, message, details);
export const providerNotConfigured = (message: string, details?: unknown) =>
  new ApiError(501, 'PROVIDER_NOT_CONFIGURED', message, details);

/** Wrap an async route handler so rejections reach the error middleware. */
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

interface ErrorShape {
  error: { code: string; message: string; details?: unknown };
}

/** Final Express error middleware — always returns the documented error shape. */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const shape: ErrorShape = {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.flatten() },
    };
    res.status(400).json(shape);
    return;
  }
  if (err instanceof ApiError) {
    const shape: ErrorShape = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(shape);
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}

/** 404 for unknown /api/v1 routes. */
export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}
