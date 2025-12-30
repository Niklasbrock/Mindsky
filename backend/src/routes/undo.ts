import { Router, Request, Response, NextFunction } from 'express';
import * as undoService from '../services/undoService.js';

const router = Router();

// Async handler wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * GET /undo/history
 * Get current undo and redo stacks
 */
router.get('/history', asyncHandler(async (_req, res) => {
  const [undoStack, redoStack] = await Promise.all([
    undoService.getUndoStack(),
    undoService.getRedoStack(),
  ]);

  res.json({ undoStack, redoStack });
}));

/**
 * POST /undo
 * Execute undo of the most recent action
 */
router.post('/', asyncHandler(async (_req, res) => {
  const action = await undoService.executeUndo();

  if (!action) {
    res.json({ success: false, error: 'No actions to undo' });
    return;
  }

  res.json({ success: true, action });
}));

/**
 * POST /undo/redo
 * Execute redo of the most recently undone action
 */
router.post('/redo', asyncHandler(async (_req, res) => {
  const action = await undoService.executeRedo();

  if (!action) {
    res.json({ success: false, error: 'No actions to redo' });
    return;
  }

  res.json({ success: true, action });
}));

/**
 * DELETE /undo/clear
 * Clear all undo/redo history
 */
router.delete('/clear', asyncHandler(async (_req, res) => {
  await undoService.clearUndoStack();
  res.json({ success: true });
}));

export default router;
