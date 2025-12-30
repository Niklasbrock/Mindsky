import { Router, Request, Response } from 'express';
import * as entityService from '../services/entityService.js';
import {
  validateBody,
  CreateMilestoneSchema,
  UpdateMilestoneSchema,
  type CreateMilestoneInput,
  type UpdateMilestoneInput,
} from '../middleware/validation.js';

const router = Router();

// GET /milestones - List all milestones
router.get('/', async (_req: Request, res: Response) => {
  try {
    const milestones = await entityService.getMilestones();
    res.json(milestones);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch milestones' });
  }
});

// GET /milestones/:id - Get single milestone
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const milestone = await entityService.getMilestoneById(req.params.id);
    res.json(milestone);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch milestone' });
  }
});

// POST /milestones - Create milestone
router.post(
  '/',
  validateBody(CreateMilestoneSchema),
  async (req: Request<object, object, CreateMilestoneInput>, res: Response) => {
    try {
      const milestone = await entityService.createMilestone(req.body);
      res.status(201).json(milestone);
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create milestone' });
    }
  }
);

// PATCH /milestones/:id - Update milestone
router.patch(
  '/:id',
  validateBody(UpdateMilestoneSchema),
  async (req: Request<{ id: string }, object, UpdateMilestoneInput>, res: Response) => {
    try {
      const milestone = await entityService.updateMilestone(req.params.id, req.body);
      res.json(milestone);
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update milestone' });
    }
  }
);

// DELETE /milestones/:id - Delete milestone
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    await entityService.deleteMilestone(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to delete milestone' });
  }
});

export default router;
