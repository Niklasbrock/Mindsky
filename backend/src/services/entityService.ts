import prisma from '../db/client.js';
import { NotFoundError } from '../utils/errors.js';
import {
  validateTitle,
  validateImportance,
  sanitizeOptionalString,
  parseOptionalDate,
  buildUpdateData,
} from '../utils/validation.js';
import { updateMetricsOnCompletion } from './metrics.js';
import { pushUndoAction } from './undoService.js';

/**
 * Input for creating/updating entities
 */
interface EntityInput {
  title?: string;
  description?: string;
  tags?: string;
  importance?: number;
  dueDate?: string | Date;
  x?: number;
  y?: number;
}

// =============================================================================
// MILESTONE OPERATIONS
// =============================================================================

export async function getMilestones() {
  return prisma.milestone.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMilestoneById(id: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id },
  });
  if (!milestone) {
    throw new NotFoundError('Milestone', id);
  }
  return milestone;
}

export async function createMilestone(input: EntityInput) {
  const milestone = await prisma.milestone.create({
    data: {
      title: validateTitle(input.title),
      description: sanitizeOptionalString(input.description),
      importance: validateImportance(input.importance),
      dueDate: parseOptionalDate(input.dueDate),
      x: typeof input.x === 'number' ? input.x : null,
      y: typeof input.y === 'number' ? input.y : null,
    },
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'create',
    entityType: 'milestone',
    entityId: milestone.id,
    afterSnapshot: milestone,
  });

  return milestone;
}

export async function updateMilestone(id: string, input: EntityInput) {
  // Capture before state
  const before = await prisma.milestone.findUnique({ where: { id } });
  if (!before) {
    throw new NotFoundError('Milestone', id);
  }

  const data = buildUpdateData(input);
  // Handle x/y coordinates for milestones
  if (input.x !== undefined) {
    data.x = typeof input.x === 'number' ? input.x : null;
  }
  if (input.y !== undefined) {
    data.y = typeof input.y === 'number' ? input.y : null;
  }

  const after = await prisma.milestone.update({
    where: { id },
    data,
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'update',
    entityType: 'milestone',
    entityId: id,
    beforeSnapshot: before,
    afterSnapshot: after,
  });

  return after;
}

export async function deleteMilestone(id: string) {
  // Capture before state including all children
  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: {
      tasks: {
        include: { subtasks: true },
      },
    },
  });
  if (!milestone) {
    throw new NotFoundError('Milestone', id);
  }

  // Build cascaded children data for undo
  const cascadedChildren = {
    tasks: milestone.tasks.map(task => ({
      entity: task,
      subtasks: task.subtasks,
    })),
  };

  await prisma.milestone.delete({ where: { id } });

  // Push to undo stack with cascade data
  await pushUndoAction({
    actionType: 'delete',
    entityType: 'milestone',
    entityId: id,
    beforeSnapshot: { ...milestone, tasks: undefined },
    metadata: { cascadedChildren },
  });
}

// =============================================================================
// TASK OPERATIONS
// =============================================================================

export async function getTasksByMilestone(milestoneId: string) {
  return prisma.task.findMany({
    where: { milestoneId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTask(milestoneId: string, input: EntityInput) {
  // Verify parent exists
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
  });
  if (!milestone) {
    throw new NotFoundError('Milestone', milestoneId);
  }

  const task = await prisma.task.create({
    data: {
      milestoneId,
      title: validateTitle(input.title),
      description: sanitizeOptionalString(input.description),
      tags: sanitizeOptionalString(input.tags),
      importance: validateImportance(input.importance),
      dueDate: parseOptionalDate(input.dueDate),
    },
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'create',
    entityType: 'task',
    entityId: task.id,
    afterSnapshot: task,
    parentId: milestoneId,
  });

  return task;
}

export async function updateTask(id: string, input: EntityInput) {
  // Capture before state
  const before = await prisma.task.findUnique({ where: { id } });
  if (!before) {
    throw new NotFoundError('Task', id);
  }

  const data = buildUpdateData(input);
  const after = await prisma.task.update({
    where: { id },
    data,
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'update',
    entityType: 'task',
    entityId: id,
    beforeSnapshot: before,
    afterSnapshot: after,
    parentId: before.milestoneId,
  });

  return after;
}

export async function deleteTask(id: string) {
  // Capture before state including subtasks
  const task = await prisma.task.findUnique({
    where: { id },
    include: { subtasks: true },
  });
  if (!task) {
    throw new NotFoundError('Task', id);
  }

  await prisma.task.delete({ where: { id } });

  // Push to undo stack with cascade data
  await pushUndoAction({
    actionType: 'delete',
    entityType: 'task',
    entityId: id,
    beforeSnapshot: { ...task, subtasks: undefined },
    parentId: task.milestoneId,
    metadata: task.subtasks.length > 0
      ? { cascadedChildren: { subtasks: task.subtasks } }
      : undefined,
  });
}

export async function completeTask(id: string) {
  // Capture before state
  const before = await prisma.task.findUnique({ where: { id } });
  if (!before) {
    throw new NotFoundError('Task', id);
  }

  const after = await prisma.task.update({
    where: { id },
    data: { completed: true },
  });
  await updateMetricsOnCompletion();

  // Push to undo stack
  await pushUndoAction({
    actionType: 'complete',
    entityType: 'task',
    entityId: id,
    beforeSnapshot: before,
    afterSnapshot: after,
    parentId: before.milestoneId,
  });

  return after;
}

export async function uncompleteTask(id: string) {
  // Capture before state
  const before = await prisma.task.findUnique({ where: { id } });
  if (!before) {
    throw new NotFoundError('Task', id);
  }

  const after = await prisma.task.update({
    where: { id },
    data: { completed: false },
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'uncomplete',
    entityType: 'task',
    entityId: id,
    beforeSnapshot: before,
    afterSnapshot: after,
    parentId: before.milestoneId,
  });

  return after;
}

export async function reassignTask(taskId: string, milestoneId: string) {
  // Verify target milestone exists
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
  });
  if (!milestone) {
    throw new NotFoundError('Milestone', milestoneId);
  }

  // Capture before state
  const before = await prisma.task.findUnique({ where: { id: taskId } });
  if (!before) {
    throw new NotFoundError('Task', taskId);
  }

  const after = await prisma.task.update({
    where: { id: taskId },
    data: { milestoneId },
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'reassign',
    entityType: 'task',
    entityId: taskId,
    beforeSnapshot: before,
    afterSnapshot: after,
    parentId: milestoneId,
    metadata: { originalParentId: before.milestoneId },
  });

  return after;
}

// =============================================================================
// SUBTASK OPERATIONS
// =============================================================================

export async function getSubtasksByTask(taskId: string) {
  return prisma.subtask.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createSubtask(taskId: string, input: EntityInput) {
  // Verify parent exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });
  if (!task) {
    throw new NotFoundError('Task', taskId);
  }

  const subtask = await prisma.subtask.create({
    data: {
      taskId,
      title: validateTitle(input.title),
      description: sanitizeOptionalString(input.description),
      tags: sanitizeOptionalString(input.tags),
      importance: validateImportance(input.importance),
      dueDate: parseOptionalDate(input.dueDate),
    },
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'create',
    entityType: 'subtask',
    entityId: subtask.id,
    afterSnapshot: subtask,
    parentId: taskId,
  });

  return subtask;
}

export async function updateSubtask(id: string, input: EntityInput) {
  // Capture before state
  const before = await prisma.subtask.findUnique({ where: { id } });
  if (!before) {
    throw new NotFoundError('Subtask', id);
  }

  const data = buildUpdateData(input);
  const after = await prisma.subtask.update({
    where: { id },
    data,
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'update',
    entityType: 'subtask',
    entityId: id,
    beforeSnapshot: before,
    afterSnapshot: after,
    parentId: before.taskId,
  });

  return after;
}

export async function deleteSubtask(id: string) {
  // Capture before state
  const subtask = await prisma.subtask.findUnique({ where: { id } });
  if (!subtask) {
    throw new NotFoundError('Subtask', id);
  }

  await prisma.subtask.delete({ where: { id } });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'delete',
    entityType: 'subtask',
    entityId: id,
    beforeSnapshot: subtask,
    parentId: subtask.taskId,
  });
}

export async function completeSubtask(id: string) {
  // Capture before state
  const before = await prisma.subtask.findUnique({ where: { id } });
  if (!before) {
    throw new NotFoundError('Subtask', id);
  }

  const after = await prisma.subtask.update({
    where: { id },
    data: { completed: true },
  });
  await updateMetricsOnCompletion();

  // Push to undo stack
  await pushUndoAction({
    actionType: 'complete',
    entityType: 'subtask',
    entityId: id,
    beforeSnapshot: before,
    afterSnapshot: after,
    parentId: before.taskId,
  });

  // Auto-complete parent task if all subtasks are now completed
  const parentTask = await prisma.task.findUnique({
    where: { id: before.taskId },
    include: { subtasks: true },
  });

  if (parentTask && parentTask.subtasks.length > 0) {
    const allSubtasksCompleted = parentTask.subtasks.every(s => s.completed);
    if (allSubtasksCompleted && !parentTask.completed) {
      // Auto-complete the parent task
      await completeTask(parentTask.id);
    }
  }

  return after;
}

export async function uncompleteSubtask(id: string) {
  // Capture before state
  const before = await prisma.subtask.findUnique({ where: { id } });
  if (!before) {
    throw new NotFoundError('Subtask', id);
  }

  const after = await prisma.subtask.update({
    where: { id },
    data: { completed: false },
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'uncomplete',
    entityType: 'subtask',
    entityId: id,
    beforeSnapshot: before,
    afterSnapshot: after,
    parentId: before.taskId,
  });

  // If parent task was completed, uncomplete it since a subtask is now incomplete
  const parentTask = await prisma.task.findUnique({
    where: { id: before.taskId },
  });

  if (parentTask && parentTask.completed) {
    await uncompleteTask(parentTask.id);
  }

  return after;
}

export async function reassignSubtask(subtaskId: string, taskId: string) {
  // Verify target task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });
  if (!task) {
    throw new NotFoundError('Task', taskId);
  }

  // Capture before state
  const before = await prisma.subtask.findUnique({ where: { id: subtaskId } });
  if (!before) {
    throw new NotFoundError('Subtask', subtaskId);
  }

  const after = await prisma.subtask.update({
    where: { id: subtaskId },
    data: { taskId },
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'reassign',
    entityType: 'subtask',
    entityId: subtaskId,
    beforeSnapshot: before,
    afterSnapshot: after,
    parentId: taskId,
    metadata: { originalParentId: before.taskId },
  });

  return after;
}

export async function promoteSubtaskToTask(subtaskId: string, milestoneId: string) {
  // Verify milestone exists
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
  });
  if (!milestone) {
    throw new NotFoundError('Milestone', milestoneId);
  }

  // Get the subtask
  const subtask = await prisma.subtask.findUnique({
    where: { id: subtaskId },
  });
  if (!subtask) {
    throw new NotFoundError('Subtask', subtaskId);
  }

  // Create new task from subtask data
  const task = await prisma.task.create({
    data: {
      milestoneId,
      title: subtask.title,
      description: subtask.description,
      tags: subtask.tags,
      importance: subtask.importance,
      dueDate: subtask.dueDate,
      completed: subtask.completed,
    },
  });

  // Delete original subtask
  await prisma.subtask.delete({
    where: { id: subtaskId },
  });

  // Push to undo stack
  await pushUndoAction({
    actionType: 'promote',
    entityType: 'subtask',
    entityId: subtaskId,
    beforeSnapshot: subtask,
    parentId: milestoneId,
    metadata: {
      createdTaskId: task.id,
      originalTaskId: subtask.taskId,
    },
  });

  return task;
}

// =============================================================================
// REORDER OPERATIONS
// =============================================================================

export async function reorderTask(taskId: string, targetTaskId: string, position: 'before' | 'after') {
  // Get the dragged task
  const draggedTask = await prisma.task.findUnique({
    where: { id: taskId },
  });
  if (!draggedTask) {
    throw new NotFoundError('Task', taskId);
  }

  // Get the target task
  const targetTask = await prisma.task.findUnique({
    where: { id: targetTaskId },
  });
  if (!targetTask) {
    throw new NotFoundError('Task', targetTaskId);
  }

  // Get all tasks in the milestone, ordered by current order
  const tasks = await prisma.task.findMany({
    where: { milestoneId: targetTask.milestoneId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  // Capture before state
  const ordersBefore: Record<string, number> = {};
  tasks.forEach(t => { ordersBefore[t.id] = t.order; });

  // Build new order array by removing dragged task and inserting at target position
  const reorderedTasks = tasks.filter(t => t.id !== taskId);
  const targetIndex = reorderedTasks.findIndex(t => t.id === targetTaskId);
  const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
  reorderedTasks.splice(insertIndex, 0, draggedTask);

  // Update all tasks with new sequential order values
  const ordersAfter: Record<string, number> = {};
  for (let i = 0; i < reorderedTasks.length; i++) {
    await prisma.task.update({
      where: { id: reorderedTasks[i].id },
      data: { order: i },
    });
    ordersAfter[reorderedTasks[i].id] = i;
  }

  // Push to undo stack
  await pushUndoAction({
    actionType: 'reorder',
    entityType: 'task',
    entityId: taskId,
    parentId: targetTask.milestoneId,
    metadata: { ordersBefore, ordersAfter },
  });

  return prisma.task.findUnique({ where: { id: taskId } });
}

export async function reorderSubtask(subtaskId: string, targetSubtaskId: string, position: 'before' | 'after') {
  // Get the dragged subtask
  const draggedSubtask = await prisma.subtask.findUnique({
    where: { id: subtaskId },
  });
  if (!draggedSubtask) {
    throw new NotFoundError('Subtask', subtaskId);
  }

  // Get the target subtask
  const targetSubtask = await prisma.subtask.findUnique({
    where: { id: targetSubtaskId },
  });
  if (!targetSubtask) {
    throw new NotFoundError('Subtask', targetSubtaskId);
  }

  // Get all subtasks in the task, ordered by current order
  const subtasks = await prisma.subtask.findMany({
    where: { taskId: targetSubtask.taskId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  // Capture before state
  const ordersBefore: Record<string, number> = {};
  subtasks.forEach(s => { ordersBefore[s.id] = s.order; });

  // Build new order array by removing dragged subtask and inserting at target position
  const reorderedSubtasks = subtasks.filter(s => s.id !== subtaskId);
  const targetIndex = reorderedSubtasks.findIndex(s => s.id === targetSubtaskId);
  const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
  reorderedSubtasks.splice(insertIndex, 0, draggedSubtask);

  // Update all subtasks with new sequential order values
  const ordersAfter: Record<string, number> = {};
  for (let i = 0; i < reorderedSubtasks.length; i++) {
    await prisma.subtask.update({
      where: { id: reorderedSubtasks[i].id },
      data: { order: i },
    });
    ordersAfter[reorderedSubtasks[i].id] = i;
  }

  // Push to undo stack
  await pushUndoAction({
    actionType: 'reorder',
    entityType: 'subtask',
    entityId: subtaskId,
    parentId: targetSubtask.taskId,
    metadata: { ordersBefore, ordersAfter },
  });

  return prisma.subtask.findUnique({ where: { id: subtaskId } });
}
