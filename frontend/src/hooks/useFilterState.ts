import { useState, useCallback } from 'react';
import type { SkyData, Milestone, Task, Subtask } from '../types';

export type SortBy = 'default' | 'dueDate' | 'importance' | 'alphabetical' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

interface UseFilterStateResult {
  selectedTags: string[];
  showCompleted: boolean;
  sortBy: SortBy;
  sortDirection: SortDirection;
  setSelectedTags: (tags: string[]) => void;
  toggleTag: (tag: string) => void;
  setShowCompleted: (show: boolean) => void;
  setSortBy: (sort: SortBy) => void;
  toggleSortDirection: () => void;
  resetFilters: () => void;
  getAvailableTags: (skyData: SkyData | null) => string[];
  applyFilters: (milestones: Milestone[]) => Milestone[];
}

/**
 * Extract all unique tags from sky data
 */
function extractAllTags(skyData: SkyData | null): string[] {
  if (!skyData) return [];

  const tags = new Set<string>();

  skyData.milestones.forEach(milestone => {
    milestone.tasks?.forEach(task => {
      if (task.tags) {
        task.tags.split(',').forEach(t => tags.add(t.trim()));
      }
      task.subtasks?.forEach(subtask => {
        if (subtask.tags) {
          subtask.tags.split(',').forEach(t => tags.add(t.trim()));
        }
      });
    });
  });

  return Array.from(tags).filter(t => t.length > 0).sort();
}

/**
 * Sort items by specified criteria
 */
function sortItems<T extends Milestone | Task | Subtask>(
  items: T[],
  sortBy: SortBy,
  direction: SortDirection
): T[] {
  const sorted = [...items].sort((a, b) => {
    switch (sortBy) {
      case 'dueDate': {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      }

      case 'importance':
        return b.importance - a.importance;

      case 'alphabetical':
        return a.title.localeCompare(b.title);

      case 'createdAt':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

      default:
        // Keep original order (by order field for tasks/subtasks)
        if ('order' in a && 'order' in b) {
          return (a.order as number) - (b.order as number);
        }
        return 0;
    }
  });

  return direction === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Hook for managing filter and sort state in list view
 */
export function useFilterState(): UseFilterStateResult {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => {
      const index = prev.indexOf(tag);
      if (index >= 0) {
        return prev.filter((_, i) => i !== index);
      } else {
        return [...prev, tag];
      }
    });
  }, []);

  const toggleSortDirection = useCallback(() => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  }, []);

  const resetFilters = useCallback(() => {
    setSelectedTags([]);
    setShowCompleted(true);
    setSortBy('default');
    setSortDirection('asc');
  }, []);

  const getAvailableTags = useCallback((skyData: SkyData | null) => {
    return extractAllTags(skyData);
  }, []);

  const applyFilters = useCallback((milestones: Milestone[]): Milestone[] => {
    // First, filter and sort at each level
    let result = milestones.map(milestone => {
      // Filter tasks
      let filteredTasks = milestone.tasks?.filter(task => {
        // Completion filter
        if (!showCompleted && task.completed) return false;

        // Tag filter (if no tags selected, show all)
        if (selectedTags.length > 0) {
          const taskTags = task.tags?.split(',').map(t => t.trim()) || [];
          const hasMatchingTag = selectedTags.some(t => taskTags.includes(t));
          if (!hasMatchingTag) {
            // Check if any subtask has matching tag
            const hasSubtaskWithTag = task.subtasks?.some(subtask => {
              const subtaskTags = subtask.tags?.split(',').map(t => t.trim()) || [];
              return selectedTags.some(t => subtaskTags.includes(t));
            });
            if (!hasSubtaskWithTag) return false;
          }
        }

        return true;
      }).map(task => {
        // Filter subtasks
        let filteredSubtasks = task.subtasks?.filter(subtask => {
          if (!showCompleted && subtask.completed) return false;

          if (selectedTags.length > 0) {
            const subtaskTags = subtask.tags?.split(',').map(t => t.trim()) || [];
            const hasMatchingTag = selectedTags.some(t => subtaskTags.includes(t));
            if (!hasMatchingTag) return false;
          }

          return true;
        }) || [];

        // Sort subtasks
        if (sortBy !== 'default') {
          filteredSubtasks = sortItems(filteredSubtasks, sortBy, sortDirection);
        }

        return { ...task, subtasks: filteredSubtasks };
      }) || [];

      // Sort tasks
      if (sortBy !== 'default') {
        filteredTasks = sortItems(filteredTasks, sortBy, sortDirection);
      }

      return { ...milestone, tasks: filteredTasks };
    });

    // Sort milestones
    if (sortBy !== 'default') {
      result = sortItems(result, sortBy, sortDirection);
    }

    return result;
  }, [selectedTags, showCompleted, sortBy, sortDirection]);

  return {
    selectedTags,
    showCompleted,
    sortBy,
    sortDirection,
    setSelectedTags,
    toggleTag,
    setShowCompleted,
    setSortBy,
    toggleSortDirection,
    resetFilters,
    getAvailableTags,
    applyFilters,
  };
}
