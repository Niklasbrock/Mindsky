import { useRef, memo } from 'react';
import type { Milestone, Task, Subtask, EntityType } from '../../types';

export type DropPosition = 'before' | 'after' | 'inside' | null;

interface ListItemProps {
  entity: Milestone | Task | Subtask;
  type: EntityType;
  depth: number;
  isCollapsed: boolean;
  isSelected: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
  onComplete?: () => void;
  onUncomplete?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, position: DropPosition) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, position: DropPosition) => void;
  dropPosition: DropPosition;
  children?: React.ReactNode;
  nightMode?: boolean;
}

// Custom comparison for React.memo - skip callback comparison since they're recreated
function arePropsEqual(prev: ListItemProps, next: ListItemProps): boolean {
  // Check entity identity and key displayed properties
  if (prev.entity.id !== next.entity.id) return false;
  if (prev.entity.title !== next.entity.title) return false;
  if (prev.entity.importance !== next.entity.importance) return false;
  if (prev.entity.dueDate !== next.entity.dueDate) return false;
  if ('completed' in prev.entity && 'completed' in next.entity) {
    if (prev.entity.completed !== next.entity.completed) return false;
  }

  // Check UI state
  if (prev.type !== next.type) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.isCollapsed !== next.isCollapsed) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.dropPosition !== next.dropPosition) return false;
  if (prev.nightMode !== next.nightMode) return false;

  // Children are compared by reference - if they changed, re-render
  if (prev.children !== next.children) return false;

  return true;
}

export const ListItem = memo(function ListItem({
  entity,
  type,
  depth,
  isCollapsed,
  isSelected,
  onToggleCollapse,
  onSelect,
  onComplete,
  onUncomplete,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  dropPosition,
  children,
  nightMode = false,
}: ListItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);

  const hasChildren =
    (type === 'milestone' && 'tasks' in entity && entity.tasks && entity.tasks.length > 0) ||
    (type === 'task' && 'subtasks' in entity && entity.subtasks && entity.subtasks.length > 0);

  const completed = 'completed' in entity ? entity.completed : false;
  const canComplete = type === 'task' || type === 'subtask';

  // Padding based on depth
  const paddingClass = depth === 0 ? 'pl-3' : depth === 1 ? 'pl-7' : 'pl-11';

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!itemRef.current) return;

    const rect = itemRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    // Divide the item into three zones: top 25%, middle 50%, bottom 25%
    // Top = before, Middle = inside (for reassignment), Bottom = after
    let position: DropPosition;
    if (y < height * 0.25) {
      position = 'before';
    } else if (y > height * 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    onDragOver(e, position);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    onDragLeave();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!itemRef.current) return;

    const rect = itemRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: DropPosition;
    if (y < height * 0.25) {
      position = 'before';
    } else if (y > height * 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    onDrop(e, position);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completed && onUncomplete) {
      onUncomplete();
    } else if (!completed && onComplete) {
      onComplete();
    }
  };

  return (
    <div
      className="relative"
      data-entity-type={type}
      data-entity-id={entity.id}
    >
      {/* Drop indicator line - BEFORE */}
      {dropPosition === 'before' && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-sky-500 z-10"
          style={{ transform: 'translateY(-1px)' }}
        >
          <div className="absolute left-2 -top-1 w-2 h-2 rounded-full bg-sky-500" />
        </div>
      )}

      {/* Main item row */}
      <div
        ref={itemRef}
        draggable
        onDragStart={onDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        className={`
          flex items-center gap-2 py-2 pr-3 ${paddingClass}
          cursor-pointer select-none
          transition-colors duration-150
          ${isSelected ? (nightMode ? 'bg-sky-900/50' : 'bg-sky-50') : ''}
          ${!isSelected ? (nightMode ? 'hover:bg-slate-700/50' : 'hover:bg-gray-50') : ''}
          ${dropPosition === 'inside' ? (nightMode ? 'bg-sky-800/50 ring-2 ring-inset ring-sky-400' : 'bg-sky-100 ring-2 ring-inset ring-sky-400') : ''}
          ${completed ? 'opacity-60' : ''}
        `}
      >
        {/* Collapse/expand chevron for milestones and tasks with children */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-colors ${nightMode ? 'hover:bg-slate-600' : 'hover:bg-gray-200'}`}
          >
            <svg
              className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'} ${nightMode ? 'text-gray-400' : 'text-gray-500'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <div className="w-4" />
        )}

        {/* Completion checkbox (tasks and subtasks only) */}
        {canComplete && (
          <button
            onClick={handleCheckboxClick}
            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center hover:border-sky-500 transition-colors ${nightMode ? 'border-gray-500' : 'border-gray-300'}`}
          >
            {completed && (
              <svg className="w-4 h-4 text-sky-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            )}
          </button>
        )}
        {!canComplete && <div className="w-5" />}

        {/* Entity title */}
        <span
          className={`
            flex-1 text-sm
            ${completed ? 'line-through' : ''}
            ${depth === 0 ? (nightMode ? 'font-medium text-gray-100' : 'font-medium text-gray-800') : ''}
            ${depth === 1 ? (nightMode ? 'text-gray-200' : 'text-gray-700') : ''}
            ${depth === 2 ? (nightMode ? 'text-gray-300' : 'text-gray-600') : ''}
          `}
        >
          {entity.title}
        </span>

        {/* Importance indicator */}
        {entity.importance > 1 && (
          <div className="flex gap-0.5">
            {Array.from({ length: entity.importance }).map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            ))}
          </div>
        )}

        {/* Due date indicator */}
        {entity.dueDate && (
          <span className={`text-xs ${nightMode ? 'text-gray-400' : 'text-gray-400'}`}>
            {new Date(entity.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {/* Drop indicator line - AFTER */}
      {dropPosition === 'after' && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 z-10"
          style={{ transform: 'translateY(1px)' }}
        >
          <div className="absolute left-2 -top-1 w-2 h-2 rounded-full bg-sky-500" />
        </div>
      )}

      {/* Children (nested items) */}
      {!isCollapsed && hasChildren && (
        <div>
          {children}
        </div>
      )}
    </div>
  );
}, arePropsEqual);
