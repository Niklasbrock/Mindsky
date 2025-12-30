import { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { ListHeader } from './ListHeader';
import { ListItem, type DropPosition } from './ListItem';
import { useListFilters } from '../../hooks/useListFilters';
import type { SkyData, CloudNode, EntityType, Milestone, Task, Subtask } from '../../types';

interface DropTarget {
  id: string;
  position: DropPosition;
}

export interface SideListViewHandle {
  getDropContext: (screenX: number, screenY: number) => { type: 'milestone' | 'task'; targetId: string } | null;
}

interface SideListViewProps {
  isOpen: boolean;
  width: number;
  onClose: () => void;
  onWidthChange: (width: number) => void;
  skyData: SkyData | null;
  onComplete: (id: string, type: 'task' | 'subtask') => Promise<void>;
  onUncomplete: (id: string, type: 'task' | 'subtask') => Promise<void>;
  onEdit: (node: CloudNode) => void;
  onReassign: (itemId: string, itemType: EntityType, newParentId: string, newParentType: EntityType) => Promise<void>;
  onReorder: (itemId: string, itemType: EntityType, targetId: string, position: 'before' | 'after') => Promise<void>;
  nightMode?: boolean;
}

export const SideListView = forwardRef<SideListViewHandle, SideListViewProps>(function SideListView({
  isOpen,
  width,
  onClose,
  onWidthChange,
  skyData,
  onComplete,
  onUncomplete,
  onEdit,
  onReassign,
  onReorder,
  nightMode = false,
}, ref) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ id: string; type: EntityType; parentId?: string } | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose getDropContext method for PlusCloudButton drag-to-create
  useImperativeHandle(ref, () => ({
    getDropContext: (screenX: number, screenY: number) => {
      if (!isOpen || !containerRef.current) return null;

      const rect = containerRef.current.getBoundingClientRect();
      // Check if point is within the side list view
      if (screenX < rect.left || screenX > rect.right || screenY < rect.top || screenY > rect.bottom) {
        return null;
      }

      // Find the element at this position
      const element = document.elementFromPoint(screenX, screenY);
      if (!element) return null;

      // Look for data attributes on the element or its parents
      const listItem = element.closest('[data-entity-type][data-entity-id]');
      if (listItem) {
        const entityType = listItem.getAttribute('data-entity-type') as 'milestone' | 'task' | 'subtask';
        const entityId = listItem.getAttribute('data-entity-id');

        if (entityId) {
          // Tasks can accept subtasks, milestones can accept tasks
          if (entityType === 'milestone') {
            return { type: 'milestone', targetId: entityId };
          } else if (entityType === 'task') {
            return { type: 'task', targetId: entityId };
          }
        }
      }

      return null;
    }
  }), [isOpen]);

  const {
    selectedTags,
    showCompleted,
    sortBy,
    sortDirection,
    collapsedMilestones,
    collapsedTasks,
    setSelectedTags,
    setShowCompleted,
    setSortBy,
    toggleSortDirection,
    toggleMilestoneCollapse,
    toggleTaskCollapse,
    getAvailableTags,
    applyFilters,
  } = useListFilters();

  // Get available tags
  const availableTags = useMemo(() => getAvailableTags(skyData), [skyData, getAvailableTags]);

  // Apply filters to milestones
  const filteredMilestones = useMemo(() => {
    if (!skyData) return [];
    return applyFilters(skyData.milestones);
  }, [skyData, applyFilters]);

  // ESC key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Resize handle logic
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = width;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartX.current - e.clientX;
      const newWidth = resizeStartWidth.current + delta;
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  // Clear drop target when drag ends
  useEffect(() => {
    const handleDragEnd = () => {
      setDropTarget(null);
      setDraggedItem(null);
    };

    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback((entityId: string, entityType: EntityType, parentId?: string) => (e: React.DragEvent) => {
    setDraggedItem({ id: entityId, type: entityType, parentId });
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: entityId,
      type: entityType,
      parentId,
    }));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const canReorder = useCallback((dragType: EntityType, targetType: EntityType, dragParentId?: string, targetParentId?: string): boolean => {
    // Can only reorder items of the same type within the same parent
    return dragType === targetType && dragParentId === targetParentId;
  }, []);

  const canReassign = useCallback((dragType: EntityType, targetType: EntityType): boolean => {
    if (dragType === 'task' && targetType === 'milestone') return true;
    if (dragType === 'subtask' && targetType === 'task') return true;
    if (dragType === 'subtask' && targetType === 'milestone') return true; // Promote
    return false;
  }, []);

  const handleItemDragOver = useCallback((targetId: string, targetType: EntityType, targetParentId?: string) =>
    (e: React.DragEvent, position: DropPosition) => {
      e.preventDefault();

      if (!draggedItem || draggedItem.id === targetId) {
        setDropTarget(null);
        return;
      }

      // Check if this is a valid drop target
      const isReorderValid = canReorder(draggedItem.type, targetType, draggedItem.parentId, targetParentId);
      const isReassignValid = canReassign(draggedItem.type, targetType);

      if (isReorderValid && (position === 'before' || position === 'after')) {
        // Allow reordering (before/after)
        e.dataTransfer.dropEffect = 'move';
        setDropTarget({ id: targetId, position });
      } else if (isReassignValid && position === 'inside') {
        // Allow reassigning (inside)
        e.dataTransfer.dropEffect = 'move';
        setDropTarget({ id: targetId, position: 'inside' });
      } else if (isReorderValid) {
        // Default to 'after' for reordering if position is 'inside' but reassign not valid
        e.dataTransfer.dropEffect = 'move';
        setDropTarget({ id: targetId, position: 'after' });
      } else if (isReassignValid) {
        // Show as reassign target
        e.dataTransfer.dropEffect = 'move';
        setDropTarget({ id: targetId, position: 'inside' });
      } else {
        setDropTarget(null);
      }
    }, [draggedItem, canReorder, canReassign]);

  const handleItemDragLeave = useCallback(() => {
    // Don't clear immediately - let dragover on another item clear it
  }, []);

  const handleItemDrop = useCallback((targetId: string, targetType: EntityType, targetParentId?: string) =>
    (e: React.DragEvent, position: DropPosition) => {
      e.preventDefault();
      setDropTarget(null);

      if (!draggedItem || draggedItem.id === targetId) return;

      const isReorderValid = canReorder(draggedItem.type, targetType, draggedItem.parentId, targetParentId);
      const isReassignValid = canReassign(draggedItem.type, targetType);

      if (isReorderValid && (position === 'before' || position === 'after')) {
        // Reorder
        onReorder(draggedItem.id, draggedItem.type, targetId, position);
      } else if (isReassignValid) {
        // Reassign
        onReassign(draggedItem.id, draggedItem.type, targetId, targetType);
      }

      setDraggedItem(null);
    }, [draggedItem, canReorder, canReassign, onReorder, onReassign]);

  // Convert entity to CloudNode for onEdit
  const createCloudNode = useCallback((entity: Milestone | Task | Subtask, type: EntityType): CloudNode => ({
    id: entity.id,
    type,
    entity,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: type === 'milestone' ? 80 : type === 'task' ? 45 : 20,
    parentId: type === 'task' ? (entity as Task).milestoneId : type === 'subtask' ? (entity as Subtask).taskId : undefined,
  }), []);

  // Check if mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Get drop position for a specific item
  const getDropPosition = useCallback((itemId: string): DropPosition => {
    if (dropTarget?.id === itemId) {
      return dropTarget.position;
    }
    return null;
  }, [dropTarget]);

  return (
    <div
      ref={containerRef}
      className={`
        fixed top-0 right-0 h-full
        ${nightMode ? 'bg-slate-800/95' : 'bg-white/95'} backdrop-blur-sm shadow-xl
        z-40 flex flex-col overflow-hidden
        transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        w-full md:w-auto
      `}
      style={{ width: isMobile ? '100%' : `${width}px` }}
    >
      {/* Resize handle (desktop only) */}
      {!isMobile && (
        <div
          className="hidden md:block absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-sky-400/50 transition-colors z-50"
          onMouseDown={handleResizeStart}
        />
      )}

      {/* Header with filters */}
      <ListHeader
        onClose={onClose}
        showCompleted={showCompleted}
        onShowCompletedChange={setShowCompleted}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortDirection={sortDirection}
        onSortDirectionToggle={toggleSortDirection}
        selectedTags={selectedTags}
        availableTags={availableTags}
        onTagsChange={setSelectedTags}
        nightMode={nightMode}
      />

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto"
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDropTarget(null)}
      >
        {filteredMilestones.length === 0 ? (
          <div className={`flex items-center justify-center h-full text-sm ${nightMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {skyData && skyData.milestones.length === 0 ? (
              <p>No milestones yet</p>
            ) : (
              <p>No items match filters</p>
            )}
          </div>
        ) : (
          <div className="py-2">
            {filteredMilestones.map(milestone => (
              <ListItem
                key={milestone.id}
                entity={milestone}
                type="milestone"
                depth={0}
                isCollapsed={collapsedMilestones.has(milestone.id)}
                isSelected={selectedItemId === milestone.id}
                onToggleCollapse={() => toggleMilestoneCollapse(milestone.id)}
                onSelect={() => setSelectedItemId(milestone.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onEdit(createCloudNode(milestone, 'milestone'));
                }}
                onDragStart={handleDragStart(milestone.id, 'milestone')}
                onDragOver={handleItemDragOver(milestone.id, 'milestone')}
                onDragLeave={handleItemDragLeave}
                onDrop={handleItemDrop(milestone.id, 'milestone')}
                dropPosition={getDropPosition(milestone.id)}
                nightMode={nightMode}
              >
                {/* Tasks */}
                {milestone.tasks?.map(task => (
                  <ListItem
                    key={task.id}
                    entity={task}
                    type="task"
                    depth={1}
                    isCollapsed={collapsedTasks.has(task.id)}
                    isSelected={selectedItemId === task.id}
                    onToggleCollapse={() => toggleTaskCollapse(task.id)}
                    onSelect={() => setSelectedItemId(task.id)}
                    onComplete={() => onComplete(task.id, 'task')}
                    onUncomplete={() => onUncomplete(task.id, 'task')}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onEdit(createCloudNode(task, 'task'));
                    }}
                    onDragStart={handleDragStart(task.id, 'task', milestone.id)}
                    onDragOver={handleItemDragOver(task.id, 'task', milestone.id)}
                    onDragLeave={handleItemDragLeave}
                    onDrop={handleItemDrop(task.id, 'task', milestone.id)}
                    dropPosition={getDropPosition(task.id)}
                    nightMode={nightMode}
                  >
                    {/* Subtasks */}
                    {task.subtasks?.map(subtask => (
                      <ListItem
                        key={subtask.id}
                        entity={subtask}
                        type="subtask"
                        depth={2}
                        isCollapsed={false}
                        isSelected={selectedItemId === subtask.id}
                        onToggleCollapse={() => {}}
                        onSelect={() => setSelectedItemId(subtask.id)}
                        onComplete={() => onComplete(subtask.id, 'subtask')}
                        onUncomplete={() => onUncomplete(subtask.id, 'subtask')}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onEdit(createCloudNode(subtask, 'subtask'));
                        }}
                        onDragStart={handleDragStart(subtask.id, 'subtask', task.id)}
                        onDragOver={handleItemDragOver(subtask.id, 'subtask', task.id)}
                        onDragLeave={handleItemDragLeave}
                        onDrop={handleItemDrop(subtask.id, 'subtask', task.id)}
                        dropPosition={getDropPosition(subtask.id)}
                        nightMode={nightMode}
                      />
                    ))}
                  </ListItem>
                ))}
              </ListItem>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
