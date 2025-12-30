import { Router, Request, Response } from 'express';
import prisma from '../db/client.js';
import { getMetrics, getNeglectScores } from '../services/metrics.js';
import { VALIDATION } from '../config/constants.js';

const router = Router();

// GET /sky - Get full sky tree (milestones with tasks and subtasks)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [milestones, metrics, neglectScores] = await Promise.all([
      prisma.milestone.findMany({
        include: {
          tasks: {
            include: {
              subtasks: {
                orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              },
            },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      getMetrics(),
      getNeglectScores(),
    ]);

    res.json({
      milestones,
      metrics,
      neglectScores,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sky data' });
  }
});

// POST /sky/import - Import sky data from JSON export
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { milestones } = req.body;

    if (!milestones || !Array.isArray(milestones)) {
      res.status(400).json({ error: 'Invalid import data: milestones array required' });
      return;
    }

    // Size limit validation
    if (milestones.length > VALIDATION.MAX_MILESTONES) {
      res.status(400).json({ error: `Import too large: maximum ${VALIDATION.MAX_MILESTONES} milestones allowed` });
      return;
    }

    // Structure validation
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (!m.id || typeof m.id !== 'string') {
        res.status(400).json({ error: `Invalid milestone at index ${i}: id is required and must be a string` });
        return;
      }
      if (!m.title || typeof m.title !== 'string') {
        res.status(400).json({ error: `Invalid milestone at index ${i}: title is required and must be a string` });
        return;
      }
      if (m.importance !== undefined && (typeof m.importance !== 'number' || m.importance < VALIDATION.IMPORTANCE_MIN || m.importance > VALIDATION.IMPORTANCE_MAX)) {
        res.status(400).json({ error: `Invalid milestone at index ${i}: importance must be a number between ${VALIDATION.IMPORTANCE_MIN} and ${VALIDATION.IMPORTANCE_MAX}` });
        return;
      }

      // Validate tasks if present
      if (m.tasks) {
        if (!Array.isArray(m.tasks)) {
          res.status(400).json({ error: `Invalid milestone at index ${i}: tasks must be an array` });
          return;
        }
        if (m.tasks.length > VALIDATION.MAX_TASKS_PER_MILESTONE) {
          res.status(400).json({ error: `Invalid milestone at index ${i}: maximum ${VALIDATION.MAX_TASKS_PER_MILESTONE} tasks per milestone` });
          return;
        }
        for (let j = 0; j < m.tasks.length; j++) {
          const t = m.tasks[j];
          if (!t.id || typeof t.id !== 'string') {
            res.status(400).json({ error: `Invalid task at milestone ${i}, task ${j}: id is required` });
            return;
          }
          if (!t.title || typeof t.title !== 'string') {
            res.status(400).json({ error: `Invalid task at milestone ${i}, task ${j}: title is required` });
            return;
          }
          if (t.importance !== undefined && (typeof t.importance !== 'number' || t.importance < VALIDATION.IMPORTANCE_MIN || t.importance > VALIDATION.IMPORTANCE_MAX)) {
            res.status(400).json({ error: `Invalid task at milestone ${i}, task ${j}: importance must be ${VALIDATION.IMPORTANCE_MIN}-${VALIDATION.IMPORTANCE_MAX}` });
            return;
          }

          // Validate subtasks if present
          if (t.subtasks) {
            if (!Array.isArray(t.subtasks)) {
              res.status(400).json({ error: `Invalid task at milestone ${i}, task ${j}: subtasks must be an array` });
              return;
            }
            if (t.subtasks.length > VALIDATION.MAX_SUBTASKS_PER_TASK) {
              res.status(400).json({ error: `Invalid task at milestone ${i}, task ${j}: maximum ${VALIDATION.MAX_SUBTASKS_PER_TASK} subtasks per task` });
              return;
            }
            for (let k = 0; k < t.subtasks.length; k++) {
              const s = t.subtasks[k];
              if (!s.id || typeof s.id !== 'string') {
                res.status(400).json({ error: `Invalid subtask at milestone ${i}, task ${j}, subtask ${k}: id is required` });
                return;
              }
              if (!s.title || typeof s.title !== 'string') {
                res.status(400).json({ error: `Invalid subtask at milestone ${i}, task ${j}, subtask ${k}: title is required` });
                return;
              }
            }
          }
        }
      }
    }

    // Use a transaction to delete all existing data and insert imported data
    const result = await prisma.$transaction(async (tx) => {
      // Delete all existing data (subtasks -> tasks -> milestones due to foreign keys)
      await tx.subtask.deleteMany({});
      await tx.task.deleteMany({});
      await tx.milestone.deleteMany({});

      let milestoneCount = 0;
      let taskCount = 0;
      let subtaskCount = 0;

      // Insert milestones with their tasks and subtasks
      for (const milestone of milestones) {
        const createdMilestone = await tx.milestone.create({
          data: {
            id: milestone.id,
            title: milestone.title,
            description: milestone.description || null,
            importance: milestone.importance ?? VALIDATION.IMPORTANCE_DEFAULT,
            dueDate: milestone.dueDate ? new Date(milestone.dueDate) : null,
            createdAt: milestone.createdAt ? new Date(milestone.createdAt) : new Date(),
            updatedAt: milestone.updatedAt ? new Date(milestone.updatedAt) : new Date(),
          },
        });
        milestoneCount++;

        // Insert tasks for this milestone
        if (milestone.tasks && Array.isArray(milestone.tasks)) {
          for (const task of milestone.tasks) {
            const createdTask = await tx.task.create({
              data: {
                id: task.id,
                milestoneId: createdMilestone.id,
                title: task.title,
                description: task.description || null,
                tags: task.tags || null,
                importance: task.importance ?? VALIDATION.IMPORTANCE_DEFAULT,
                dueDate: task.dueDate ? new Date(task.dueDate) : null,
                completed: task.completed ?? false,
                createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
                updatedAt: task.updatedAt ? new Date(task.updatedAt) : new Date(),
              },
            });
            taskCount++;

            // Insert subtasks for this task
            if (task.subtasks && Array.isArray(task.subtasks)) {
              for (const subtask of task.subtasks) {
                await tx.subtask.create({
                  data: {
                    id: subtask.id,
                    taskId: createdTask.id,
                    title: subtask.title,
                    description: subtask.description || null,
                    tags: subtask.tags || null,
                    importance: subtask.importance ?? VALIDATION.IMPORTANCE_DEFAULT,
                    dueDate: subtask.dueDate ? new Date(subtask.dueDate) : null,
                    completed: subtask.completed ?? false,
                    createdAt: subtask.createdAt ? new Date(subtask.createdAt) : new Date(),
                    updatedAt: subtask.updatedAt ? new Date(subtask.updatedAt) : new Date(),
                  },
                });
                subtaskCount++;
              }
            }
          }
        }
      }

      return { milestoneCount, taskCount, subtaskCount };
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Import failed:', error);
    res.status(500).json({ error: 'Failed to import sky data' });
  }
});

// POST /sky/reset - Reset all data (delete all milestones, tasks, subtasks)
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    await prisma.$transaction(async (tx) => {
      // Delete all existing data (subtasks -> tasks -> milestones due to foreign keys)
      await tx.subtask.deleteMany({});
      await tx.task.deleteMany({});
      await tx.milestone.deleteMany({});

      // Reset metrics to defaults
      await tx.metrics.upsert({
        where: { id: 1 },
        update: {
          totalCompletedCount: 0,
          momentumScore: 0,
          sunBrightness: 0,
          lastCompletionAt: null,
        },
        create: {
          id: 1,
          totalCompletedCount: 0,
          momentumScore: 0,
          sunBrightness: 0,
          lastCompletionAt: null,
        },
      });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Reset failed:', error);
    res.status(500).json({ error: 'Failed to reset data' });
  }
});

export default router;
