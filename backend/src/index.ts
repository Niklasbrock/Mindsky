import express from 'express';
import cors from 'cors';
import prisma from './db/client.js';
import milestonesRouter from './routes/milestones.js';
import tasksRouter from './routes/tasks.js';
import subtasksRouter from './routes/subtasks.js';
import metricsRouter from './routes/metrics.js';
import skyRouter from './routes/sky.js';
import undoRouter from './routes/undo.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'mindsky-backend'
  });
});

// API Routes
app.use('/milestones', milestonesRouter);
app.use('/', tasksRouter);      // Handles /milestones/:id/tasks and /tasks/:id
app.use('/', subtasksRouter);   // Handles /tasks/:id/subtasks and /subtasks/:id
app.use('/metrics', metricsRouter);
app.use('/sky', skyRouter);
app.use('/undo', undoRouter);

// Error handling (must be after routes)
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    // Ensure metrics singleton exists
    await prisma.metrics.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        totalCompletedCount: 0,
        momentumScore: 0,
        sunBrightness: 0.2,
      },
    });

    app.listen(PORT, () => {
      console.log(`Mindsky backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
