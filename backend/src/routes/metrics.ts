import { Router, Request, Response } from 'express';
import { getMetrics } from '../services/metrics.js';

const router = Router();

// GET /metrics - Get current metrics
router.get('/', async (_req: Request, res: Response) => {
  try {
    const metrics = await getMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

export default router;
