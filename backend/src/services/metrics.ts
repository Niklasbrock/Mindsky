import prisma from '../db/client.js';
import { METRICS, VALIDATION } from '../config/constants.js';

// Destructure for cleaner usage
const {
  SUN_BASE,
  SUN_MOMENTUM_FACTOR,
  SUN_LOAD_FACTOR,
  COMPLETION_WINDOW_HOURS,
  NEGLECT_THRESHOLD_HOURS,
  MAX_MOMENTUM_COMPLETIONS,
  MAX_LOAD_IMPORTANCE,
} = METRICS;

/**
 * Calculate sun brightness based on design brief formula:
 * sunBrightness = clamp(0.2 + 0.6*M - 0.4*L, 0, 1)
 * M = momentum (recent completion velocity)
 * L = outstanding importance load
 */
async function calculateSunBrightness(): Promise<number> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - COMPLETION_WINDOW_HOURS * 60 * 60 * 1000);

  // Count recent completions (tasks + subtasks completed in last 48h)
  const [recentTasks, recentSubtasks] = await Promise.all([
    prisma.task.count({
      where: {
        completed: true,
        updatedAt: { gte: windowStart },
      },
    }),
    prisma.subtask.count({
      where: {
        completed: true,
        updatedAt: { gte: windowStart },
      },
    }),
  ]);

  const recentCompletions = recentTasks + recentSubtasks;

  // Calculate total outstanding importance
  const [outstandingTasks, outstandingSubtasks] = await Promise.all([
    prisma.task.aggregate({
      where: { completed: false },
      _sum: { importance: true },
    }),
    prisma.subtask.aggregate({
      where: { completed: false },
      _sum: { importance: true },
    }),
  ]);

  const totalOutstandingImportance =
    (outstandingTasks._sum.importance || 0) + (outstandingSubtasks._sum.importance || 0);

  // Normalize momentum (0-1 scale)
  const momentum = Math.min(recentCompletions / MAX_MOMENTUM_COMPLETIONS, 1);

  // Normalize load (0-1 scale)
  const load = Math.min(totalOutstandingImportance / MAX_LOAD_IMPORTANCE, 1);

  // Apply formula
  const sunBrightness = Math.max(0, Math.min(1, SUN_BASE + SUN_MOMENTUM_FACTOR * momentum - SUN_LOAD_FACTOR * load));

  return sunBrightness;
}

/**
 * Update metrics after a completion event
 */
export async function updateMetricsOnCompletion(): Promise<void> {
  const sunBrightness = await calculateSunBrightness();

  // Count total completed
  const [completedTasks, completedSubtasks] = await Promise.all([
    prisma.task.count({ where: { completed: true } }),
    prisma.subtask.count({ where: { completed: true } }),
  ]);

  const totalCompletedCount = completedTasks + completedSubtasks;

  // Calculate momentum score (recent completions / time)
  const now = new Date();
  const windowStart = new Date(now.getTime() - COMPLETION_WINDOW_HOURS * 60 * 60 * 1000);

  const [recentTasks, recentSubtasks] = await Promise.all([
    prisma.task.count({
      where: {
        completed: true,
        updatedAt: { gte: windowStart },
      },
    }),
    prisma.subtask.count({
      where: {
        completed: true,
        updatedAt: { gte: windowStart },
      },
    }),
  ]);

  const momentumScore = (recentTasks + recentSubtasks) / COMPLETION_WINDOW_HOURS;

  await prisma.metrics.upsert({
    where: { id: 1 },
    update: {
      totalCompletedCount,
      lastCompletionAt: now,
      momentumScore,
      sunBrightness,
    },
    create: {
      id: 1,
      totalCompletedCount,
      lastCompletionAt: now,
      momentumScore,
      sunBrightness,
    },
  });
}

/**
 * Get current metrics
 */
export async function getMetrics() {
  const metrics = await prisma.metrics.findUnique({
    where: { id: 1 },
  });

  if (!metrics) {
    // Return defaults if no metrics exist yet
    return {
      id: 1,
      totalCompletedCount: 0,
      lastCompletionAt: null,
      momentumScore: 0,
      sunBrightness: SUN_BASE,
    };
  }

  return metrics;
}

/**
 * Calculate neglect scores for each milestone
 * Design brief: neglectScore = (time since last activity × importance)
 * Returns normalized 0-1 scores where 1 = severely neglected (72h+)
 */
export async function getNeglectScores(): Promise<Record<string, number>> {
  const now = new Date();
  const neglectScores: Record<string, number> = {};

  // Get all milestones with their tasks and subtasks
  const milestones = await prisma.milestone.findMany({
    include: {
      tasks: {
        include: {
          subtasks: true,
        },
      },
    },
  });

  for (const milestone of milestones) {
    // Find the most recent activity in this milestone cluster
    let lastActivity = milestone.updatedAt;

    for (const task of milestone.tasks) {
      if (task.updatedAt > lastActivity) {
        lastActivity = task.updatedAt;
      }
      for (const subtask of task.subtasks) {
        if (subtask.updatedAt > lastActivity) {
          lastActivity = subtask.updatedAt;
        }
      }
    }

    // Calculate hours since last activity
    const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);

    // Get milestone importance (default if not set), clamped to valid range
    const rawImportance = milestone.importance ?? VALIDATION.IMPORTANCE_DEFAULT;
    const importance = Math.min(VALIDATION.IMPORTANCE_MAX, Math.max(VALIDATION.IMPORTANCE_MIN, rawImportance));

    // Calculate raw neglect score (hours × importance factor)
    // Normalize importance to 0.5-1.5 range so it affects but doesn't dominate
    const importanceFactor = 0.5 + (importance / VALIDATION.IMPORTANCE_MAX);
    const rawNeglect = hoursSinceActivity * importanceFactor;

    // Normalize to 0-1 scale where NEGLECT_THRESHOLD_HOURS = 1.0
    const normalizedNeglect = Math.min(1, rawNeglect / NEGLECT_THRESHOLD_HOURS);

    neglectScores[milestone.id] = normalizedNeglect;
  }

  return neglectScores;
}
