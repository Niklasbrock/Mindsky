import { Request, Response, NextFunction } from 'express';
import { AppError, toAppError } from '../utils/errors.js';
import { ValidationError } from '../utils/validation.js';

/**
 * Global error handler middleware
 * Converts errors to consistent JSON responses with proper status codes
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging
  console.error('[Error]', err instanceof Error ? err.message : err);

  // Handle ValidationError from validation.ts
  if (err instanceof ValidationError) {
    res.status(400).json({
      error: err.message,
      field: err.field,
    });
    return;
  }

  // Handle AppError (includes NotFoundError, BadRequestError)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // Convert unknown errors to AppError
  const appError = toAppError(err);
  res.status(appError.statusCode).json({
    error: appError.message,
  });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
  });
}
