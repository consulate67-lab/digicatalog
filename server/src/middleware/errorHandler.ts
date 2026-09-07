import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

/**
 * Global error handler. Tüm route'lardan sonra app.use ile eklenir.
 *
 * Hata tipleri:
 * - ZodError → 400 + validation details
 * - HttpError (custom) → status + message
 * - Diğer → 500 + generic message (detay loglanır)
 */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid request data',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.name,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Bilinmeyen hata — logla, generic mesaj dön
  logger.error(
    { err, path: req.path, method: req.method },
    'Unhandled error in request',
  );

  res.status(500).json({
    error: 'InternalServerError',
    message:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
  });
};
