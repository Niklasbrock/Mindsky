/**
 * Request body types for API endpoints
 * Provides type safety for incoming request data
 */

// =============================================================================
// ENTITY CREATE/UPDATE TYPES
// =============================================================================

export interface CreateMilestoneBody {
  title: string;
  description?: string;
  importance?: number;
  dueDate?: string;
  x?: number;
  y?: number;
}

export interface UpdateMilestoneBody {
  title?: string;
  description?: string;
  importance?: number;
  dueDate?: string;
  x?: number;
  y?: number;
}

export interface CreateTaskBody {
  title: string;
  description?: string;
  tags?: string;
  importance?: number;
  dueDate?: string;
}

export interface UpdateTaskBody {
  title?: string;
  description?: string;
  tags?: string;
  importance?: number;
  dueDate?: string;
}

export interface CreateSubtaskBody {
  title: string;
  description?: string;
  tags?: string;
  importance?: number;
  dueDate?: string;
}

export interface UpdateSubtaskBody {
  title?: string;
  description?: string;
  tags?: string;
  importance?: number;
  dueDate?: string;
}

// =============================================================================
// REASSIGN/REORDER TYPES
// =============================================================================

export interface ReassignTaskBody {
  milestoneId: string;
}

export interface ReassignSubtaskBody {
  taskId: string;
}

export interface PromoteSubtaskBody {
  milestoneId: string;
}

export interface ReorderTaskBody {
  taskId: string;
  targetTaskId: string;
  position: 'before' | 'after';
}

export interface ReorderSubtaskBody {
  subtaskId: string;
  targetSubtaskId: string;
  position: 'before' | 'after';
}
