import type { Milestone, Task, Subtask, SkyData } from '../types';
import {
  SkyDataSchema,
  MilestoneSchema,
  TaskSchema,
  SubtaskSchema,
  ImportResultSchema,
  ResetResultSchema,
} from '../schemas/api';

const API_BASE = '/api';

/**
 * Typed API error with status code and optional response body.
 * Provides helper methods for common error type checks.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: { error?: string; details?: unknown }
  ) {
    const message = body?.error || `API Error ${status}: ${statusText}`;
    super(message);
    this.name = 'ApiError';
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isValidationError(): boolean {
    return this.status === 400;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    // Try to parse error body for more details
    const body = await response.json().catch(() => undefined);
    throw new ApiError(response.status, response.statusText, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Sky
export async function getSky(signal?: AbortSignal): Promise<SkyData> {
  const data = await request<unknown>('/sky', { signal });
  return SkyDataSchema.parse(data) as SkyData;
}

// Milestones
export async function getMilestones(): Promise<Milestone[]> {
  return request<Milestone[]>('/milestones');
}

export async function createMilestone(data: {
  title: string;
  description?: string | null;
  importance?: number;
  dueDate?: string;
  x?: number;
  y?: number;
}): Promise<Milestone> {
  const result = await request<unknown>('/milestones', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return MilestoneSchema.parse(result) as Milestone;
}

export async function updateMilestone(
  id: string,
  data: Partial<Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Milestone> {
  const result = await request<unknown>(`/milestones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return MilestoneSchema.parse(result) as Milestone;
}

export async function deleteMilestone(id: string): Promise<void> {
  return request<void>(`/milestones/${id}`, { method: 'DELETE' });
}

// Tasks
export async function createTask(
  milestoneId: string,
  data: {
    title: string;
    description?: string | null;
    tags?: string | null;
    importance?: number;
    dueDate?: string;
  }
): Promise<Task> {
  const result = await request<unknown>(`/milestones/${milestoneId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return TaskSchema.parse(result) as Task;
}

export async function updateTask(
  id: string,
  data: Partial<Omit<Task, 'id' | 'milestoneId' | 'createdAt' | 'updatedAt'>>
): Promise<Task> {
  const result = await request<unknown>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return TaskSchema.parse(result) as Task;
}

export async function deleteTask(id: string): Promise<void> {
  return request<void>(`/tasks/${id}`, { method: 'DELETE' });
}

export async function completeTask(id: string): Promise<Task> {
  const result = await request<unknown>(`/tasks/${id}/complete`, { method: 'POST' });
  return TaskSchema.parse(result) as Task;
}

export async function uncompleteTask(id: string): Promise<Task> {
  const result = await request<unknown>(`/tasks/${id}/uncomplete`, { method: 'POST' });
  return TaskSchema.parse(result) as Task;
}

// Subtasks
export async function createSubtask(
  taskId: string,
  data: {
    title: string;
    description?: string | null;
    tags?: string | null;
    importance?: number;
    dueDate?: string;
  }
): Promise<Subtask> {
  const result = await request<unknown>(`/tasks/${taskId}/subtasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return SubtaskSchema.parse(result) as Subtask;
}

export async function updateSubtask(
  id: string,
  data: Partial<Omit<Subtask, 'id' | 'taskId' | 'createdAt' | 'updatedAt'>>
): Promise<Subtask> {
  const result = await request<unknown>(`/subtasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return SubtaskSchema.parse(result) as Subtask;
}

export async function deleteSubtask(id: string): Promise<void> {
  return request<void>(`/subtasks/${id}`, { method: 'DELETE' });
}

export async function completeSubtask(id: string): Promise<Subtask> {
  const result = await request<unknown>(`/subtasks/${id}/complete`, { method: 'POST' });
  return SubtaskSchema.parse(result) as Subtask;
}

export async function uncompleteSubtask(id: string): Promise<Subtask> {
  const result = await request<unknown>(`/subtasks/${id}/uncomplete`, { method: 'POST' });
  return SubtaskSchema.parse(result) as Subtask;
}

// Reassignment functions
export async function reassignTask(taskId: string, milestoneId: string): Promise<Task> {
  const result = await request<unknown>(`/tasks/${taskId}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ milestoneId }),
  });
  return TaskSchema.parse(result) as Task;
}

export async function reassignSubtask(subtaskId: string, taskId: string): Promise<Subtask> {
  const result = await request<unknown>(`/subtasks/${subtaskId}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
  return SubtaskSchema.parse(result) as Subtask;
}

export async function promoteSubtaskToTask(subtaskId: string, milestoneId: string): Promise<Task> {
  const result = await request<unknown>(`/subtasks/${subtaskId}/promote`, {
    method: 'POST',
    body: JSON.stringify({ milestoneId }),
  });
  return TaskSchema.parse(result) as Task;
}

// Reordering functions
export async function reorderTask(taskId: string, targetTaskId: string, position: 'before' | 'after'): Promise<Task> {
  const result = await request<unknown>('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ taskId, targetTaskId, position }),
  });
  return TaskSchema.parse(result) as Task;
}

export async function reorderSubtask(subtaskId: string, targetSubtaskId: string, position: 'before' | 'after'): Promise<Subtask> {
  const result = await request<unknown>('/subtasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ subtaskId, targetSubtaskId, position }),
  });
  return SubtaskSchema.parse(result) as Subtask;
}

// Import sky data
export async function importSky(data: { milestones: Milestone[] }): Promise<{
  success: boolean;
  milestoneCount: number;
  taskCount: number;
  subtaskCount: number;
}> {
  const result = await request<unknown>('/sky/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return ImportResultSchema.parse(result);
}

// Reset sky data (delete all milestones, tasks, subtasks)
export async function resetSky(): Promise<{ success: boolean }> {
  const result = await request<unknown>('/sky/reset', { method: 'POST' });
  return ResetResultSchema.parse(result);
}

// =============================================================================
// UNDO/REDO
// =============================================================================

export interface UndoAction {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeSnapshot: string | null;
  afterSnapshot: string | null;
  parentId: string | null;
  metadata: string | null;
  isUndone: boolean;
  createdAt: string;
}

export interface UndoHistoryResponse {
  undoStack: UndoAction[];
  redoStack: UndoAction[];
}

export interface UndoResult {
  success: boolean;
  action?: UndoAction;
  error?: string;
}

export async function getUndoHistory(): Promise<UndoHistoryResponse> {
  return request<UndoHistoryResponse>('/undo/history');
}

export async function executeUndo(): Promise<UndoResult> {
  return request<UndoResult>('/undo', { method: 'POST' });
}

export async function executeRedo(): Promise<UndoResult> {
  return request<UndoResult>('/undo/redo', { method: 'POST' });
}

export async function clearUndoHistory(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/undo/clear', { method: 'DELETE' });
}
