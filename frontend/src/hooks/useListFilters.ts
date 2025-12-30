import { useFilterState, type SortBy, type SortDirection } from './useFilterState';
import { useCollapseState } from './useCollapseState';
import type { Milestone, SkyData } from '../types';

// Re-export types for backwards compatibility
export type { SortBy, SortDirection };

interface UseListFiltersResult {
  // Filter state
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
  // Collapse state
  collapsedMilestones: Set<string>;
  collapsedTasks: Set<string>;
  toggleMilestoneCollapse: (id: string) => void;
  toggleTaskCollapse: (id: string) => void;
}

/**
 * Combined hook for list view filters and collapse state
 * Composes useFilterState and useCollapseState for backwards compatibility
 */
export function useListFilters(): UseListFiltersResult {
  const filterState = useFilterState();
  const collapseState = useCollapseState();

  return {
    // Filter state
    selectedTags: filterState.selectedTags,
    showCompleted: filterState.showCompleted,
    sortBy: filterState.sortBy,
    sortDirection: filterState.sortDirection,
    setSelectedTags: filterState.setSelectedTags,
    toggleTag: filterState.toggleTag,
    setShowCompleted: filterState.setShowCompleted,
    setSortBy: filterState.setSortBy,
    toggleSortDirection: filterState.toggleSortDirection,
    resetFilters: filterState.resetFilters,
    getAvailableTags: filterState.getAvailableTags,
    applyFilters: filterState.applyFilters,
    // Collapse state
    collapsedMilestones: collapseState.collapsedMilestones,
    collapsedTasks: collapseState.collapsedTasks,
    toggleMilestoneCollapse: collapseState.toggleMilestoneCollapse,
    toggleTaskCollapse: collapseState.toggleTaskCollapse,
  };
}
