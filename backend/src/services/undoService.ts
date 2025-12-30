import prisma from '../db/client.js';
import { NotFoundError } from '../utils/errors.js';
import { updateMetricsOnCompletion } from './metrics.js';

const MAX_UNDO_STACK = 5;

// =============================================================================
// TYPES
// =============================================================================

export type UndoActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'complete'
  | 'uncomplete'
  | 'reassign'
  | 'promote'
  | 'reorder';

export type EntityType = 'milestone' | 'task' | 'subtask';

export interface CreateUndoActionInput {
  actionType: UndoActionType;
  entityType: EntityType;
  entityId: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  parentId?: string;
  metadata?: unknown;
}

interface CascadedChildren {
  tasks?: Array<{ entity: unknown; subtasks: unknown[] }>;
  subtasks?: unknown[];
}

interface ReorderMetadata {
  ordersBefore: Record<string, number>;
  ordersAfter: Record<string, number>;
}

interface PromoteMetadata {
  createdTaskId: string;
  originalTaskId: string;
}

interface ReassignMetadata {
  originalParentId: string;
}

// =============================================================================
// STACK OPERATIONS
// =============================================================================

/**
 * Push a new action to the undo stack.
 * Clears any redo actions (isUndone=true) and enforces stack limit.
 */
export async function pushUndoAction(input: CreateUndoActionInput): Promise<void> {
  // Clear redo stack (any actions that were undone)
  await prisma.undoAction.deleteMany({
    where: { isUndone: true },
  });

  // Create new action
  await prisma.undoAction.create({
    data: {
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeSnapshot: input.beforeSnapshot ? JSON.stringify(input.beforeSnapshot) : null,
      afterSnapshot: input.afterSnapshot ? JSON.stringify(input.afterSnapshot) : null,
      parentId: input.parentId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      isUndone: false,
    },
  });

  // Enforce stack limit - keep only MAX_UNDO_STACK most recent non-undone actions
  await enforceStackLimit();
}

/**
 * Enforce the stack size limit by deleting oldest actions.
 */
async function enforceStackLimit(): Promise<void> {
  const count = await prisma.undoAction.count({
    where: { isUndone: false },
  });

  if (count > MAX_UNDO_STACK) {
    // Get IDs of oldest actions that exceed the limit
    const toDelete = await prisma.undoAction.findMany({
      where: { isUndone: false },
      orderBy: { createdAt: 'asc' },
      take: count - MAX_UNDO_STACK,
      select: { id: true },
    });

    await prisma.undoAction.deleteMany({
      where: { id: { in: toDelete.map(a => a.id) } },
    });
  }
}

/**
 * Get the current undo stack (actions that can be undone).
 * Returns most recent first.
 */
export async function getUndoStack() {
  return prisma.undoAction.findMany({
    where: { isUndone: false },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get the current redo stack (actions that have been undone).
 * Returns oldest undone action first (the one to redo next).
 */
export async function getRedoStack() {
  return prisma.undoAction.findMany({
    where: { isUndone: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Clear all undo/redo history.
 */
export async function clearUndoStack(): Promise<void> {
  await prisma.undoAction.deleteMany({});
}

// =============================================================================
// UNDO EXECUTION
// =============================================================================

/**
 * Execute undo of the most recent action.
 * Returns the undone action, or null if stack is empty.
 */
export async function executeUndo() {
  // Get the most recent non-undone action
  const action = await prisma.undoAction.findFirst({
    where: { isUndone: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!action) {
    return null;
  }

  // Perform the reversal
  await reverseAction(action);

  // Mark as undone (moves to redo stack)
  await prisma.undoAction.update({
    where: { id: action.id },
    data: { isUndone: true },
  });

  return action;
}

/**
 * Execute redo of the most recently undone action.
 * Returns the redone action, or null if redo stack is empty.
 */
export async function executeRedo() {
  // Get the oldest undone action (first to be redone)
  const action = await prisma.undoAction.findFirst({
    where: { isUndone: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!action) {
    return null;
  }

  // Re-execute the original action
  await replayAction(action);

  // Mark as not undone (moves back to undo stack)
  await prisma.undoAction.update({
    where: { id: action.id },
    data: { isUndone: false },
  });

  return action;
}

// =============================================================================
// ACTION REVERSAL
// =============================================================================

/**
 * Reverse an action (undo it).
 */
async function reverseAction(action: {
  actionType: string;
  entityType: string;
  entityId: string;
  beforeSnapshot: string | null;
  afterSnapshot: string | null;
  parentId: string | null;
  metadata: string | null;
}): Promise<void> {
  const beforeSnapshot = action.beforeSnapshot ? JSON.parse(action.beforeSnapshot) : null;
  const metadata = action.metadata ? JSON.parse(action.metadata) : null;

  switch (action.actionType) {
    case 'create':
      // Undo create = delete the entity
      await deleteEntityDirect(action.entityType as EntityType, action.entityId);
      break;

    case 'delete':
      // Undo delete = recreate the entity from beforeSnapshot
      await recreateEntity(action.entityType as EntityType, beforeSnapshot, action.parentId);
      // Recreate any cascaded children
      if (metadata?.cascadedChildren) {
        await recreateCascadedChildren(metadata.cascadedChildren);
      }
      break;

    case 'update':
      // Undo update = restore beforeSnapshot values
      await updateEntityDirect(action.entityType as EntityType, action.entityId, beforeSnapshot);
      break;

    case 'complete':
      // Undo complete = uncomplete
      await uncompleteEntityDirect(action.entityType as EntityType, action.entityId);
      break;

    case 'uncomplete':
      // Undo uncomplete = complete
      await completeEntityDirect(action.entityType as EntityType, action.entityId);
      break;

    case 'reassign': {
      // Undo reassign = reassign back to original parent
      const reassignMeta = metadata as ReassignMetadata;
      await reassignEntityDirect(action.entityType as EntityType, action.entityId, reassignMeta.originalParentId);
      break;
    }

    case 'promote': {
      // Undo promote = delete created task, recreate original subtask
      const promoteMeta = metadata as PromoteMetadata;
      await demoteTaskToSubtask(promoteMeta.createdTaskId, beforeSnapshot, promoteMeta.originalTaskId);
      break;
    }

    case 'reorder': {
      // Undo reorder = restore original order values
      const reorderMeta = metadata as ReorderMetadata;
      await restoreOrder(action.entityType as EntityType, reorderMeta.ordersBefore);
      break;
    }
  }
}

/**
 * Replay an action (redo it).
 */
async function replayAction(action: {
  actionType: string;
  entityType: string;
  entityId: string;
  beforeSnapshot: string | null;
  afterSnapshot: string | null;
  parentId: string | null;
  metadata: string | null;
}): Promise<void> {
  const afterSnapshot = action.afterSnapshot ? JSON.parse(action.afterSnapshot) : null;
  const metadata = action.metadata ? JSON.parse(action.metadata) : null;

  switch (action.actionType) {
    case 'create':
      // Redo create = recreate the entity from afterSnapshot
      await recreateEntity(action.entityType as EntityType, afterSnapshot, action.parentId);
      break;

    case 'delete':
      // Redo delete = delete the entity again
      await deleteEntityDirect(action.entityType as EntityType, action.entityId);
      break;

    case 'update':
      // Redo update = apply afterSnapshot values
      await updateEntityDirect(action.entityType as EntityType, action.entityId, afterSnapshot);
      break;

    case 'complete':
      // Redo complete = complete again
      await completeEntityDirect(action.entityType as EntityType, action.entityId);
      break;

    case 'uncomplete':
      // Redo uncomplete = uncomplete again
      await uncompleteEntityDirect(action.entityType as EntityType, action.entityId);
      break;

    case 'reassign': {
      // Redo reassign = reassign to new parent (from afterSnapshot)
      const newParentId = action.entityType === 'task'
        ? afterSnapshot.milestoneId
        : afterSnapshot.taskId;
      await reassignEntityDirect(action.entityType as EntityType, action.entityId, newParentId);
      break;
    }

    case 'promote': {
      // Redo promote = re-promote subtask to task
      const promoteMeta = metadata as PromoteMetadata;
      const beforeSnapshot = action.beforeSnapshot ? JSON.parse(action.beforeSnapshot) : null;
      await promoteSubtaskDirect(beforeSnapshot, action.entityId, promoteMeta.createdTaskId);
      break;
    }

    case 'reorder': {
      // Redo reorder = apply new order values
      const reorderMeta = metadata as ReorderMetadata;
      await restoreOrder(action.entityType as EntityType, reorderMeta.ordersAfter);
      break;
    }
  }
}

// =============================================================================
// DIRECT ENTITY OPERATIONS (no undo tracking)
// =============================================================================

async function deleteEntityDirect(entityType: EntityType, id: string): Promise<void> {
  switch (entityType) {
    case 'milestone':
      await prisma.milestone.delete({ where: { id } });
      break;
    case 'task':
      await prisma.task.delete({ where: { id } });
      break;
    case 'subtask':
      await prisma.subtask.delete({ where: { id } });
      break;
  }
}

async function recreateEntity(entityType: EntityType, snapshot: unknown, parentId: string | null): Promise<void> {
  const data = snapshot as Record<string, unknown>;

  switch (entityType) {
    case 'milestone':
      await prisma.milestone.create({
        data: {
          id: data.id as string,
          title: data.title as string,
          description: data.description as string | null,
          importance: data.importance as number,
          dueDate: data.dueDate ? new Date(data.dueDate as string) : null,
          x: data.x as number | null,
          y: data.y as number | null,
          createdAt: new Date(data.createdAt as string),
        },
      });
      break;
    case 'task':
      await prisma.task.create({
        data: {
          id: data.id as string,
          milestoneId: parentId || (data.milestoneId as string),
          title: data.title as string,
          description: data.description as string | null,
          tags: data.tags as string | null,
          importance: data.importance as number,
          dueDate: data.dueDate ? new Date(data.dueDate as string) : null,
          completed: data.completed as boolean,
          order: data.order as number,
          createdAt: new Date(data.createdAt as string),
        },
      });
      break;
    case 'subtask':
      await prisma.subtask.create({
        data: {
          id: data.id as string,
          taskId: parentId || (data.taskId as string),
          title: data.title as string,
          description: data.description as string | null,
          tags: data.tags as string | null,
          importance: data.importance as number,
          dueDate: data.dueDate ? new Date(data.dueDate as string) : null,
          completed: data.completed as boolean,
          order: data.order as number,
          createdAt: new Date(data.createdAt as string),
        },
      });
      break;
  }
}

async function recreateCascadedChildren(cascaded: CascadedChildren): Promise<void> {
  // Recreate tasks with their subtasks (for milestone delete)
  if (cascaded.tasks) {
    for (const taskData of cascaded.tasks) {
      const task = taskData.entity as Record<string, unknown>;
      await recreateEntity('task', task, task.milestoneId as string);

      // Recreate subtasks for this task
      for (const subtask of taskData.subtasks) {
        await recreateEntity('subtask', subtask, task.id as string);
      }
    }
  }

  // Recreate subtasks only (for task delete)
  if (cascaded.subtasks) {
    for (const subtask of cascaded.subtasks) {
      const data = subtask as Record<string, unknown>;
      await recreateEntity('subtask', subtask, data.taskId as string);
    }
  }
}

async function updateEntityDirect(entityType: EntityType, id: string, snapshot: unknown): Promise<void> {
  const data = snapshot as Record<string, unknown>;

  switch (entityType) {
    case 'milestone':
      await prisma.milestone.update({
        where: { id },
        data: {
          title: data.title as string,
          description: data.description as string | null,
          importance: data.importance as number,
          dueDate: data.dueDate ? new Date(data.dueDate as string) : null,
          x: data.x as number | null,
          y: data.y as number | null,
        },
      });
      break;
    case 'task':
      await prisma.task.update({
        where: { id },
        data: {
          title: data.title as string,
          description: data.description as string | null,
          tags: data.tags as string | null,
          importance: data.importance as number,
          dueDate: data.dueDate ? new Date(data.dueDate as string) : null,
          completed: data.completed as boolean,
        },
      });
      break;
    case 'subtask':
      await prisma.subtask.update({
        where: { id },
        data: {
          title: data.title as string,
          description: data.description as string | null,
          tags: data.tags as string | null,
          importance: data.importance as number,
          dueDate: data.dueDate ? new Date(data.dueDate as string) : null,
          completed: data.completed as boolean,
        },
      });
      break;
  }
}

async function completeEntityDirect(entityType: EntityType, id: string): Promise<void> {
  if (entityType === 'task') {
    await prisma.task.update({
      where: { id },
      data: { completed: true },
    });
  } else if (entityType === 'subtask') {
    await prisma.subtask.update({
      where: { id },
      data: { completed: true },
    });
  }
  await updateMetricsOnCompletion();
}

async function uncompleteEntityDirect(entityType: EntityType, id: string): Promise<void> {
  if (entityType === 'task') {
    await prisma.task.update({
      where: { id },
      data: { completed: false },
    });
  } else if (entityType === 'subtask') {
    await prisma.subtask.update({
      where: { id },
      data: { completed: false },
    });
  }
}

async function reassignEntityDirect(entityType: EntityType, id: string, newParentId: string): Promise<void> {
  if (entityType === 'task') {
    await prisma.task.update({
      where: { id },
      data: { milestoneId: newParentId },
    });
  } else if (entityType === 'subtask') {
    await prisma.subtask.update({
      where: { id },
      data: { taskId: newParentId },
    });
  }
}

async function demoteTaskToSubtask(taskId: string, subtaskSnapshot: unknown, originalTaskId: string): Promise<void> {
  // Delete the promoted task
  await prisma.task.delete({ where: { id: taskId } });

  // Recreate the original subtask
  await recreateEntity('subtask', subtaskSnapshot, originalTaskId);
}

async function promoteSubtaskDirect(subtaskSnapshot: unknown, originalSubtaskId: string, newTaskId: string): Promise<void> {
  const data = subtaskSnapshot as Record<string, unknown>;

  // Get the milestone ID from the parent task
  const parentTask = await prisma.task.findUnique({
    where: { id: data.taskId as string },
    select: { milestoneId: true },
  });

  if (!parentTask) {
    throw new NotFoundError('Task', data.taskId as string);
  }

  // Create the task with the original task ID from the promote action
  await prisma.task.create({
    data: {
      id: newTaskId,
      milestoneId: parentTask.milestoneId,
      title: data.title as string,
      description: data.description as string | null,
      tags: data.tags as string | null,
      importance: data.importance as number,
      dueDate: data.dueDate ? new Date(data.dueDate as string) : null,
      completed: data.completed as boolean,
    },
  });

  // Delete the subtask (it was recreated during undo)
  try {
    await prisma.subtask.delete({ where: { id: originalSubtaskId } });
  } catch {
    // Subtask may not exist if this is the original promote
  }
}

async function restoreOrder(entityType: EntityType, orders: Record<string, number>): Promise<void> {
  const updates = Object.entries(orders).map(([id, order]) => {
    if (entityType === 'task') {
      return prisma.task.update({ where: { id }, data: { order } });
    } else {
      return prisma.subtask.update({ where: { id }, data: { order } });
    }
  });

  await Promise.all(updates);
}
