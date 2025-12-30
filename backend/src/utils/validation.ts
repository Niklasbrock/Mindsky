import { VALIDATION } from '../config/constants.js';

/**
 * Validation error with field information
 */
export class ValidationError extends Error {
  field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validate that a title is non-empty
 */
export function validateTitle(title: unknown): string {
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new ValidationError('Title is required', 'title');
  }
  return title.trim();
}

/**
 * Validate importance is within valid range (1-5)
 */
export function validateImportance(importance: unknown): number {
  if (importance === undefined || importance === null) {
    return VALIDATION.IMPORTANCE_DEFAULT;
  }

  if (typeof importance !== 'number') {
    throw new ValidationError('Importance must be a number', 'importance');
  }

  if (importance < VALIDATION.IMPORTANCE_MIN || importance > VALIDATION.IMPORTANCE_MAX) {
    throw new ValidationError(
      `Importance must be between ${VALIDATION.IMPORTANCE_MIN} and ${VALIDATION.IMPORTANCE_MAX}`,
      'importance'
    );
  }

  return importance;
}

/**
 * Sanitize optional string fields (trim or null)
 */
export function sanitizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Parse optional date field
 */
export function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Build update data object from partial input
 * Only includes fields that are explicitly provided
 */
export function buildUpdateData(input: {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  importance?: unknown;
  dueDate?: unknown;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (input.title !== undefined) {
    data.title = validateTitle(input.title);
  }
  if (input.description !== undefined) {
    data.description = sanitizeOptionalString(input.description);
  }
  if (input.tags !== undefined) {
    data.tags = sanitizeOptionalString(input.tags);
  }
  if (input.importance !== undefined) {
    data.importance = validateImportance(input.importance);
  }
  if (input.dueDate !== undefined) {
    data.dueDate = parseOptionalDate(input.dueDate);
  }

  return data;
}
