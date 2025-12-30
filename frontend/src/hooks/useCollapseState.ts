import { useState, useCallback } from 'react';

interface UseCollapseStateResult {
  collapsedMilestones: Set<string>;
  collapsedTasks: Set<string>;
  toggleMilestoneCollapse: (id: string) => void;
  toggleTaskCollapse: (id: string) => void;
  collapseAll: (ids: string[], type: 'milestone' | 'task') => void;
  expandAll: (type: 'milestone' | 'task') => void;
}

/**
 * Hook for managing collapse state of milestones and tasks in list view
 */
export function useCollapseState(): UseCollapseStateResult {
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(new Set());
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());

  const toggleMilestoneCollapse = useCallback((id: string) => {
    setCollapsedMilestones(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleTaskCollapse = useCallback((id: string) => {
    setCollapsedTasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback((ids: string[], type: 'milestone' | 'task') => {
    if (type === 'milestone') {
      setCollapsedMilestones(new Set(ids));
    } else {
      setCollapsedTasks(new Set(ids));
    }
  }, []);

  const expandAll = useCallback((type: 'milestone' | 'task') => {
    if (type === 'milestone') {
      setCollapsedMilestones(new Set());
    } else {
      setCollapsedTasks(new Set());
    }
  }, []);

  return {
    collapsedMilestones,
    collapsedTasks,
    toggleMilestoneCollapse,
    toggleTaskCollapse,
    collapseAll,
    expandAll,
  };
}
