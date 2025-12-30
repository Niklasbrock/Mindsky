import { Router, Request, Response } from 'express';
import * as entityService from '../services/entityService.js';
import { BadRequestError } from '../utils/errors.js';
import type {
  CreateSubtaskBody,
  UpdateSubtaskBody,
  ReassignSubtaskBody,
  PromoteSubtaskBody,
  ReorderSubtaskBody,
} from '../types/requests.js';

const router = Router();

// GET /tasks/:taskId/subtasks - List subtasks for a task
router.get('/tasks/:taskId/subtasks', async (req: Request<{ taskId: string }>, res: Response) => {
  try {
    const subtasks = await entityService.getSubtasksByTask(req.params.taskId);
    res.json(subtasks);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch subtasks' });
  }
});

// POST /tasks/:taskId/subtasks - Create subtask for a task
router.post('/tasks/:taskId/subtasks', async (req: Request<{ taskId: string }, object, CreateSubtaskBody>, res: Response) => {
  try {
    const subtask = await entityService.createSubtask(req.params.taskId, req.body);
    res.status(201).json(subtask);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create subtask' });
  }
});

// PATCH /subtasks/:id - Update subtask
router.patch('/subtasks/:id', async (req: Request<{ id: string }, object, UpdateSubtaskBody>, res: Response) => {
  try {
    const subtask = await entityService.updateSubtask(req.params.id, req.body);
    res.json(subtask);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update subtask' });
  }
});

// DELETE /subtasks/:id - Delete subtask
router.delete('/subtasks/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    await entityService.deleteSubtask(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to delete subtask' });
  }
});

// POST /subtasks/:id/complete - Mark subtask as complete
router.post('/subtasks/:id/complete', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const subtask = await entityService.completeSubtask(req.params.id);
    res.json(subtask);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to complete subtask' });
  }
});

// POST /subtasks/:id/uncomplete - Mark subtask as incomplete
router.post('/subtasks/:id/uncomplete', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const subtask = await entityService.uncompleteSubtask(req.params.id);
    res.json(subtask);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to uncomplete subtask' });
  }
});

// POST /subtasks/:id/reassign - Reassign subtask to a different task
router.post('/subtasks/:id/reassign', async (req: Request<{ id: string }, object, ReassignSubtaskBody>, res: Response) => {
  try {
    const { taskId } = req.body;
    if (!taskId) {
      throw new BadRequestError('taskId is required');
    }
    const subtask = await entityService.reassignSubtask(req.params.id, taskId);
    res.json(subtask);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to reassign subtask' });
  }
});

// POST /subtasks/:id/promote - Promote subtask to task under a milestone
router.post('/subtasks/:id/promote', async (req: Request<{ id: string }, object, PromoteSubtaskBody>, res: Response) => {
  try {
    const { milestoneId } = req.body;
    if (!milestoneId) {
      throw new BadRequestError('milestoneId is required');
    }
    const task = await entityService.promoteSubtaskToTask(req.params.id, milestoneId);
    res.json(task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to promote subtask to task' });
  }
});

// POST /subtasks/reorder - Reorder subtask within same task
router.post('/subtasks/reorder', async (req: Request<object, object, ReorderSubtaskBody>, res: Response) => {
  try {
    const { subtaskId, targetSubtaskId, position } = req.body;

    if (!subtaskId || !targetSubtaskId || !position) {
      throw new BadRequestError('subtaskId, targetSubtaskId, and position are required');
    }

    if (position !== 'before' && position !== 'after') {
      throw new BadRequestError('position must be "before" or "after"');
    }

    const subtask = await entityService.reorderSubtask(subtaskId, targetSubtaskId, position);
    res.json(subtask);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to reorder subtask' });
  }
});

export default router;
