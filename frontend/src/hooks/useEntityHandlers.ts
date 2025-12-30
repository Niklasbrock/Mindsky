import { useCallback } from 'react';
import type { EntityType } from '../types';
import type { SkyCanvasHandle } from '../components/SkyCanvas';
import * as api from '../services/api';
import { audioService } from '../services/audio';

interface EntityData {
  title: string;
  description?: string | null;
  importance?: number;
  tags?: string | null;
  dueDate?: string;
}

interface UseEntityHandlersOptions {
  refresh: () => void;
  refreshUndoStack: () => Promise<void>;
  skyCanvasRef: React.RefObject<SkyCanvasHandle>;
  setFocusedNode: (node: null) => void;
  showError?: (message: string) => void;
}

export function useEntityHandlers({
  refresh,
  refreshUndoStack,
  skyCanvasRef,
  setFocusedNode,
  showError,
}: UseEntityHandlersOptions) {
  // Create handlers
  const createMilestone = useCallback(async (data: {
    title: string;
    description?: string | null;
    importance?: number;
    dueDate?: string;
    x?: number;
    y?: number;
  }) => {
    try {
      await api.createMilestone(data);
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to create milestone:', err);
      showError?.('Failed to create milestone');
    }
  }, [refresh, refreshUndoStack, showError]);

  const createTask = useCallback(async (milestoneId: string, data: EntityData) => {
    try {
      await api.createTask(milestoneId, data);
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to create task:', err);
      showError?.('Failed to create task');
    }
  }, [refresh, refreshUndoStack, showError]);

  const createSubtask = useCallback(async (taskId: string, data: EntityData) => {
    try {
      await api.createSubtask(taskId, data);
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to create subtask:', err);
      showError?.('Failed to create subtask');
    }
  }, [refresh, refreshUndoStack, showError]);

  // Update handler
  const updateEntity = useCallback(async (id: string, type: EntityType, data: EntityData) => {
    try {
      if (type === 'milestone') {
        await api.updateMilestone(id, data);
      } else if (type === 'task') {
        await api.updateTask(id, data);
      } else {
        await api.updateSubtask(id, data);
      }
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to update:', err);
      showError?.('Failed to save changes');
    }
  }, [refresh, refreshUndoStack, showError]);

  // Delete handler
  const deleteEntity = useCallback(async (id: string, type: EntityType) => {
    try {
      if (type === 'milestone') {
        await api.deleteMilestone(id);
      } else if (type === 'task') {
        await api.deleteTask(id);
      } else {
        await api.deleteSubtask(id);
      }
      setFocusedNode(null);
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to delete:', err);
      showError?.('Failed to delete');
    }
  }, [refresh, refreshUndoStack, setFocusedNode, showError]);

  // Complete handler
  const completeEntity = useCallback(async (id: string, type: 'task' | 'subtask') => {
    try {
      // Trigger dissolve animation and play sound
      skyCanvasRef.current?.dissolveCloud(id);
      audioService.playComplete();

      if (type === 'task') {
        await api.completeTask(id);
      } else {
        await api.completeSubtask(id);
      }
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to complete:', err);
      showError?.('Failed to complete');
    }
  }, [refresh, refreshUndoStack, skyCanvasRef, showError]);

  const uncompleteEntity = useCallback(async (id: string, type: 'task' | 'subtask') => {
    try {
      if (type === 'task') {
        await api.uncompleteTask(id);
      } else {
        await api.uncompleteSubtask(id);
      }
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to uncomplete:', err);
      showError?.('Failed to restore');
    }
  }, [refresh, refreshUndoStack, showError]);

  // Reassign handler (drag and drop)
  const reassignEntity = useCallback(async (
    cloudId: string,
    cloudType: string,
    targetId: string,
    targetType: string
  ) => {
    try {
      if (cloudType === 'task' && targetType === 'milestone') {
        await api.reassignTask(cloudId, targetId);
        audioService.playClick();
      } else if (cloudType === 'subtask' && targetType === 'task') {
        await api.reassignSubtask(cloudId, targetId);
        audioService.playClick();
      } else if (cloudType === 'subtask' && targetType === 'milestone') {
        await api.promoteSubtaskToTask(cloudId, targetId);
        audioService.playClick();
      }
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to reassign:', err);
      showError?.('Failed to move item');
    }
  }, [refresh, refreshUndoStack, showError]);

  // Reorder handler (list view drag and drop)
  const reorderEntity = useCallback(async (
    itemId: string,
    itemType: EntityType,
    targetId: string,
    position: 'before' | 'after'
  ) => {
    try {
      if (itemType === 'task') {
        await api.reorderTask(itemId, targetId, position);
      } else if (itemType === 'subtask') {
        await api.reorderSubtask(itemId, targetId, position);
      }
      refresh();
      refreshUndoStack();
    } catch (err) {
      console.error('Failed to reorder:', err);
      showError?.('Failed to reorder');
    }
  }, [refresh, refreshUndoStack, showError]);

  return {
    createMilestone,
    createTask,
    createSubtask,
    updateEntity,
    deleteEntity,
    completeEntity,
    uncompleteEntity,
    reassignEntity,
    reorderEntity,
  };
}
