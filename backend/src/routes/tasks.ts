import { Router, Request, Response } from 'express';
import * as entityService from '../services/entityService.js';
import { BadRequestError } from '../utils/errors.js';
import type {
  CreateTaskBody,
  UpdateTaskBody,
  ReassignTaskBody,
  ReorderTaskBody,
} from '../types/requests.js';

const router = Router();

// GET /milestones/:milestoneId/tasks - List tasks for a milestone
router.get('/milestones/:milestoneId/tasks', async (req: Request<{ milestoneId: string }>, res: Response) => {
  try {
    const tasks = await entityService.getTasksByMilestone(req.params.milestoneId);
    res.json(tasks);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch tasks' });
  }
});

// POST /milestones/:milestoneId/tasks - Create task for a milestone
router.post('/milestones/:milestoneId/tasks', async (req: Request<{ milestoneId: string }, object, CreateTaskBody>, res: Response) => {
  try {
    const task = await entityService.createTask(req.params.milestoneId, req.body);
    res.status(201).json(task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create task' });
  }
});

// PATCH /tasks/:id - Update task
router.patch('/tasks/:id', async (req: Request<{ id: string }, object, UpdateTaskBody>, res: Response) => {
  try {
    const task = await entityService.updateTask(req.params.id, req.body);
    res.json(task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update task' });
  }
});

// DELETE /tasks/:id - Delete task
router.delete('/tasks/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    await entityService.deleteTask(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to delete task' });
  }
});

// POST /tasks/:id/complete - Mark task as complete
router.post('/tasks/:id/complete', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const task = await entityService.completeTask(req.params.id);
    res.json(task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to complete task' });
  }
});

// POST /tasks/:id/uncomplete - Mark task as incomplete
router.post('/tasks/:id/uncomplete', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const task = await entityService.uncompleteTask(req.params.id);
    res.json(task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to uncomplete task' });
  }
});

// POST /tasks/:id/reassign - Reassign task to a different milestone
router.post('/tasks/:id/reassign', async (req: Request<{ id: string }, object, ReassignTaskBody>, res: Response) => {
  try {
    const { milestoneId } = req.body;
    if (!milestoneId) {
      throw new BadRequestError('milestoneId is required');
    }
    const task = await entityService.reassignTask(req.params.id, milestoneId);
    res.json(task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to reassign task' });
  }
});

// POST /tasks/reorder - Reorder task within same milestone
router.post('/tasks/reorder', async (req: Request<object, object, ReorderTaskBody>, res: Response) => {
  try {
    const { taskId, targetTaskId, position } = req.body;

    if (!taskId || !targetTaskId || !position) {
      throw new BadRequestError('taskId, targetTaskId, and position are required');
    }

    if (position !== 'before' && position !== 'after') {
      throw new BadRequestError('position must be "before" or "after"');
    }

    const task = await entityService.reorderTask(taskId, targetTaskId, position);
    res.json(task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to reorder task' });
  }
});

export default router;
