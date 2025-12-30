import { useState, useRef, useCallback } from 'react';
import type { EntityType } from '../types';

interface PlusCloudButtonProps {
  onClick: () => void;
  onDragToTarget?: (type: EntityType, x: number, y: number, targetId?: string) => void;
  getDropContext?: (x: number, y: number) => { type: 'sky' | 'milestone' | 'task'; targetId?: string } | null;
}

export function PlusCloudButton({ onClick, onDragToTarget, getDropContext }: PlusCloudButtonProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [dropContext, setDropContext] = useState<{ type: 'sky' | 'milestone' | 'task'; targetId?: string } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startPosRef.current.x;
      const dy = moveEvent.clientY - startPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 10) {
        isDraggingRef.current = true;
        setIsDragging(true);
        setDragPosition({ x: moveEvent.clientX, y: moveEvent.clientY });

        // Get drop context for visual feedback
        if (getDropContext) {
          const context = getDropContext(moveEvent.clientX, moveEvent.clientY);
          setDropContext(context);
        }
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      if (isDraggingRef.current && onDragToTarget) {
        // Determine type based on where it was dropped
        const context = getDropContext?.(upEvent.clientX, upEvent.clientY);

        if (context) {
          if (context.type === 'sky') {
            // Dropped on empty sky - create milestone
            onDragToTarget('milestone', upEvent.clientX, upEvent.clientY);
          } else if (context.type === 'milestone' && context.targetId) {
            // Dropped on milestone - create task
            onDragToTarget('task', upEvent.clientX, upEvent.clientY, context.targetId);
          } else if (context.type === 'task' && context.targetId) {
            // Dropped on task - create subtask
            onDragToTarget('subtask', upEvent.clientX, upEvent.clientY, context.targetId);
          }
        }
      } else {
        // Simple click
        const dx = upEvent.clientX - startPosRef.current.x;
        const dy = upEvent.clientY - startPosRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= 10) {
          onClick();
        }
      }

      setIsDragging(false);
      setDropContext(null);
      isDraggingRef.current = false;
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [onClick, onDragToTarget, getDropContext]);

  // Get label based on drop context
  const getDropLabel = () => {
    if (!dropContext) return 'Drop to create';
    switch (dropContext.type) {
      case 'milestone':
        return 'Create Task';
      case 'task':
        return 'Create Subtask';
      default:
        return 'Create Milestone';
    }
  };

  // Get color based on drop context
  const getDropColor = () => {
    if (!dropContext) return 'bg-white/80';
    switch (dropContext.type) {
      case 'milestone':
        return 'bg-blue-100/90';
      case 'task':
        return 'bg-green-100/90';
      default:
        return 'bg-white/80';
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onPointerDown={handlePointerDown}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-white/90 shadow-lg
                   flex items-center justify-center text-3xl text-sky-500 hover:bg-white
                   hover:scale-110 active:scale-95 transition-all duration-200 z-10
                   select-none touch-none"
        title="Add new cloud (click or drag)"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Drag indicator */}
      {isDragging && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: dragPosition.x - 30,
            top: dragPosition.y - 30,
          }}
        >
          <div className={`w-16 h-16 rounded-full ${getDropColor()} shadow-xl flex items-center justify-center animate-pulse transition-colors duration-150`}>
            <svg className="w-8 h-8 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm text-white bg-gray-800/80 px-2 py-1 rounded">
            {getDropLabel()}
          </div>
        </div>
      )}
    </>
  );
}
