import type { SkyData, Task, Subtask, Milestone } from '../types';

/**
 * Result of finding an entity by ID
 */
export interface EntitySearchResult<T> {
  entity: T;
  parentId: string;
}

/**
 * Find a task by ID within sky data
 * @returns The task and its parent milestone ID, or null if not found
 */
export function findTaskById(
  skyData: SkyData,
  taskId: string
): EntitySearchResult<Task> | null {
  for (const milestone of skyData.milestones) {
    const task = milestone.tasks?.find(t => t.id === taskId);
    if (task) {
      return { entity: task, parentId: milestone.id };
    }
  }
  return null;
}

/**
 * Find a subtask by ID within sky data
 * @returns The subtask and its parent task ID, or null if not found
 */
export function findSubtaskById(
  skyData: SkyData,
  subtaskId: string
): EntitySearchResult<Subtask> | null {
  for (const milestone of skyData.milestones) {
    for (const task of milestone.tasks || []) {
      const subtask = task.subtasks?.find(s => s.id === subtaskId);
      if (subtask) {
        return { entity: subtask, parentId: task.id };
      }
    }
  }
  return null;
}

/**
 * Find a milestone by ID within sky data
 * @returns The milestone, or null if not found
 * Note: Milestones don't have a parent, so we return a simplified result
 */
export function findMilestoneById(
  skyData: SkyData,
  milestoneId: string
): Milestone | null {
  return skyData.milestones.find(m => m.id === milestoneId) || null;
}

/**
 * Find any completable entity (task or subtask) by ID and type
 * @returns The entity data and parent ID, or null if not found
 */
export function findCompletableEntity(
  skyData: SkyData,
  id: string,
  type: 'task' | 'subtask'
): EntitySearchResult<Task | Subtask> | null {
  if (type === 'task') {
    return findTaskById(skyData, id);
  } else {
    return findSubtaskById(skyData, id);
  }
}

/**
 * Find any entity (milestone, task, or subtask) by ID and type
 * @returns The entity data and parent ID (if applicable), or null if not found
 */
export function findEntityById(
  skyData: SkyData,
  id: string,
  type: 'milestone' | 'task' | 'subtask'
): { entity: Milestone | Task | Subtask; parentId?: string } | null {
  if (type === 'milestone') {
    const milestone = findMilestoneById(skyData, id);
    return milestone ? { entity: milestone } : null;
  } else if (type === 'task') {
    return findTaskById(skyData, id);
  } else {
    return findSubtaskById(skyData, id);
  }
}
