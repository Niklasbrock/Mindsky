/**
 * Base error class for application errors
 */
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

/**
 * Entity not found error (404)
 */
export class NotFoundError extends AppError {
  entityType: string;

  constructor(entityType: string, id?: string) {
    const message = id
      ? `${entityType} with id '${id}' not found`
      : `${entityType} not found`;
    super(message, 404);
    this.name = 'NotFoundError';
    this.entityType = entityType;
  }
}

/**
 * Validation error (400)
 */
export class BadRequestError extends AppError {
  field?: string;

  constructor(message: string, field?: string) {
    super(message, 400);
    this.name = 'BadRequestError';
    this.field = field;
  }
}

/**
 * Convert unknown error to AppError for consistent handling
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message);
  }

  return new AppError('An unexpected error occurred');
}
