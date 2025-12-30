import { z, ZodError, ZodIssue } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { VALIDATION } from '../config/constants.js';

/**
 * Middleware factory that validates request body against a Zod schema.
 * Returns 400 with validation error details on failure.
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const zodError = result.error as ZodError;
      const errors = zodError.issues.map((issue: ZodIssue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }
    // Replace req.body with validated data (with defaults applied)
    req.body = result.data;
    next();
  };
}

// ===========================================================================
// HELPERS
// ===========================================================================

// Helper to transform null to undefined for compatibility with entityService
const nullToUndefined = <T>(val: T | null | undefined): T | undefined =>
  val === null ? undefined : val;

// Optional string that converts null to undefined
const optionalString = z.string().optional().nullable().transform(nullToUndefined);

// ===========================================================================
// ENTITY SCHEMAS
// ===========================================================================

// Create milestone schema
export const CreateMilestoneSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: optionalString,
  importance: z.number()
    .min(VALIDATION.IMPORTANCE_MIN)
    .max(VALIDATION.IMPORTANCE_MAX)
    .optional()
    .default(VALIDATION.IMPORTANCE_DEFAULT),
  dueDate: optionalString,
  x: z.number().optional(),
  y: z.number().optional(),
});

// Update milestone schema (all fields optional)
export const UpdateMilestoneSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').optional(),
  description: optionalString,
  importance: z.number()
    .min(VALIDATION.IMPORTANCE_MIN)
    .max(VALIDATION.IMPORTANCE_MAX)
    .optional(),
  dueDate: optionalString,
  x: z.number().optional(),
  y: z.number().optional(),
});

// Create task schema
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: optionalString,
  tags: optionalString,
  importance: z.number()
    .min(VALIDATION.IMPORTANCE_MIN)
    .max(VALIDATION.IMPORTANCE_MAX)
    .optional()
    .default(VALIDATION.IMPORTANCE_DEFAULT),
  dueDate: optionalString,
});

// Update task schema (all fields optional)
export const UpdateTaskSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').optional(),
  description: optionalString,
  tags: optionalString,
  importance: z.number()
    .min(VALIDATION.IMPORTANCE_MIN)
    .max(VALIDATION.IMPORTANCE_MAX)
    .optional(),
  dueDate: optionalString,
});

// Create subtask schema (same as task)
export const CreateSubtaskSchema = CreateTaskSchema;

// Update subtask schema (same as task)
export const UpdateSubtaskSchema = UpdateTaskSchema;

// ===========================================================================
// REASSIGN/REORDER SCHEMAS
// ===========================================================================

export const ReassignTaskSchema = z.object({
  milestoneId: z.string().min(1, 'milestoneId is required'),
});

export const ReassignSubtaskSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
});

export const PromoteSubtaskSchema = z.object({
  milestoneId: z.string().min(1, 'milestoneId is required'),
});

export const ReorderTaskSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  targetTaskId: z.string().min(1, 'targetTaskId is required'),
  position: z.enum(['before', 'after']),
});

export const ReorderSubtaskSchema = z.object({
  subtaskId: z.string().min(1, 'subtaskId is required'),
  targetSubtaskId: z.string().min(1, 'targetSubtaskId is required'),
  position: z.enum(['before', 'after']),
});

// ===========================================================================
// INFERRED TYPES (can replace the manual interface definitions)
// ===========================================================================

export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateSubtaskInput = z.infer<typeof CreateSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof UpdateSubtaskSchema>;
export type ReassignTaskInput = z.infer<typeof ReassignTaskSchema>;
export type ReassignSubtaskInput = z.infer<typeof ReassignSubtaskSchema>;
export type PromoteSubtaskInput = z.infer<typeof PromoteSubtaskSchema>;
export type ReorderTaskInput = z.infer<typeof ReorderTaskSchema>;
export type ReorderSubtaskInput = z.infer<typeof ReorderSubtaskSchema>;
