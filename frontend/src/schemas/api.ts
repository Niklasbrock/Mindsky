import { z } from 'zod';

// Subtask schema
export const SubtaskSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  tags: z.string().nullable(),
  importance: z.number(),
  dueDate: z.string().nullable(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Task schema
export const TaskSchema = z.object({
  id: z.string(),
  milestoneId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  tags: z.string().nullable(),
  importance: z.number(),
  dueDate: z.string().nullable(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  subtasks: z.array(SubtaskSchema).optional(),
});

// Milestone schema
export const MilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  importance: z.number(),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  tasks: z.array(TaskSchema).optional(),
});

// Metrics schema
export const MetricsSchema = z.object({
  id: z.number(),
  totalCompletedCount: z.number(),
  lastCompletionAt: z.string().nullable(),
  momentumScore: z.number(),
  sunBrightness: z.number(),
  updatedAt: z.string(),
});

// SkyData schema (response from GET /sky)
export const SkyDataSchema = z.object({
  milestones: z.array(MilestoneSchema),
  metrics: MetricsSchema,
  neglectScores: z.record(z.string(), z.number()).optional(),
});

// Import result schema
export const ImportResultSchema = z.object({
  success: z.boolean(),
  milestoneCount: z.number(),
  taskCount: z.number(),
  subtaskCount: z.number(),
});

// Reset result schema
export const ResetResultSchema = z.object({
  success: z.boolean(),
});

// Infer types from schemas
export type SubtaskDTO = z.infer<typeof SubtaskSchema>;
export type TaskDTO = z.infer<typeof TaskSchema>;
export type MilestoneDTO = z.infer<typeof MilestoneSchema>;
export type MetricsDTO = z.infer<typeof MetricsSchema>;
export type SkyDataDTO = z.infer<typeof SkyDataSchema>;
