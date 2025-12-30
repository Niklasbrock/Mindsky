import { useState, useCallback, useEffect, useRef } from 'react';
import * as api from '../services/api';
import type { UndoAction } from '../services/api';

interface UseUndoStackResult {
  /** Whether there are actions that can be undone */
  canUndo: boolean;
  /** Whether there are actions that can be redone */
  canRedo: boolean;
  /** The most recent undoable action */
  lastUndoAction: UndoAction | null;
  /** Execute undo via backend */
  undo: () => Promise<boolean>;
  /** Execute redo via backend */
  redo: () => Promise<boolean>;
  /** Refresh the undo/redo stacks from backend */
  refreshStack: () => Promise<void>;
  /** Whether an undo/redo operation is in progress */
  loading: boolean;
}

/**
 * Hook for managing undo/redo with backend persistence.
 *
 * The undo stack is stored in the database and survives page reloads.
 * All entity operations automatically push to the undo stack on the backend.
 * This hook provides the interface to view and execute undo/redo operations.
 */
export function useUndoStack(): UseUndoStackResult {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  const [loading, setLoading] = useState(false);

  // Track if we're mounted to avoid state updates after unmount
  const mountedRef = useRef(true);

  // Fetch undo/redo history from backend
  const fetchHistory = useCallback(async () => {
    try {
      const { undoStack, redoStack } = await api.getUndoHistory();
      if (mountedRef.current) {
        setUndoStack(undoStack);
        setRedoStack(redoStack);
      }
    } catch (err) {
      console.error('Failed to fetch undo history:', err);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    mountedRef.current = true;
    fetchHistory();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchHistory]);

  // Execute undo via backend
  const undo = useCallback(async (): Promise<boolean> => {
    if (loading) return false;

    setLoading(true);
    try {
      const result = await api.executeUndo();
      if (result.success) {
        await fetchHistory();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to execute undo:', err);
      return false;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [loading, fetchHistory]);

  // Execute redo via backend
  const redo = useCallback(async (): Promise<boolean> => {
    if (loading) return false;

    setLoading(true);
    try {
      const result = await api.executeRedo();
      if (result.success) {
        await fetchHistory();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to execute redo:', err);
      return false;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [loading, fetchHistory]);

  // Listen for Ctrl+Z (undo) and Ctrl+Shift+Z (redo) keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          // Ctrl+Shift+Z = Redo
          window.dispatchEvent(new CustomEvent('redo-requested'));
        } else {
          // Ctrl+Z = Undo
          window.dispatchEvent(new CustomEvent('undo-requested'));
        }
      }
      // Also support Ctrl+Y for redo (Windows style)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('redo-requested'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    lastUndoAction: undoStack[0] ?? null,
    undo,
    redo,
    refreshStack: fetchHistory,
    loading,
  };
}

// Re-export UndoAction type for convenience
export type { UndoAction };
