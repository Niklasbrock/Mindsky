export interface Milestone {
  id: string;
  title: string;
  description: string | null;
  importance: number;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  x?: number;  // Canvas X position (optional for backwards compatibility)
  y?: number;  // Canvas Y position (optional for backwards compatibility)
  tasks?: Task[];
}

export interface Task {
  id: string;
  milestoneId: string;
  title: string;
  description: string | null;
  tags: string | null;
  importance: number;
  dueDate: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  subtasks?: Subtask[];
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  tags: string | null;
  importance: number;
  dueDate: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Metrics {
  id: number;
  totalCompletedCount: number;
  lastCompletionAt: string | null;
  momentumScore: number;
  sunBrightness: number;
  updatedAt: string;
}

export interface SkyData {
  milestones: Milestone[];
  metrics: Metrics;
  neglectScores?: Record<string, number>; // milestoneId -> 0-1 neglect level
}

export type EntityType = 'milestone' | 'task' | 'subtask';

// Discriminated union for type-safe entity access
export type MilestoneEntity = { type: 'milestone'; entity: Milestone };
export type TaskEntity = { type: 'task'; entity: Task };
export type SubtaskEntity = { type: 'subtask'; entity: Subtask };
export type TypedEntity = MilestoneEntity | TaskEntity | SubtaskEntity;

// Type guards for entity narrowing
export function isMilestoneEntity(te: TypedEntity): te is MilestoneEntity {
  return te.type === 'milestone';
}

export function isTaskEntity(te: TypedEntity): te is TaskEntity {
  return te.type === 'task';
}

export function isSubtaskEntity(te: TypedEntity): te is SubtaskEntity {
  return te.type === 'subtask';
}

// Base CloudNode interface
interface CloudNodeBase {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  parentId?: string;
}

// Discriminated CloudNode types for exhaustive type checking
export type MilestoneCloudNode = CloudNodeBase & MilestoneEntity;
export type TaskCloudNode = CloudNodeBase & TaskEntity;
export type SubtaskCloudNode = CloudNodeBase & SubtaskEntity;
export type TypedCloudNode = MilestoneCloudNode | TaskCloudNode | SubtaskCloudNode;

// Legacy CloudNode type for backwards compatibility
export interface CloudNode {
  id: string;
  type: EntityType;
  entity: Milestone | Task | Subtask;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  parentId?: string;
}
