import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { Application, Container, Graphics, Ticker } from 'pixi.js';
import type { SkyData, CloudNode } from '../types';
import { Cloud } from './Cloud';
import { createNodes, applyForces, findNodeAt, findNeighbors, startDragPhysics, updateDragPhysics, endDragPhysics } from '../services/physics';
import { ANIMATION } from '../config/animation';
import { LAYOUT } from '../config/layout';
import { INTERACTION } from '../config/constants';
import {
  isInCompleteZone,
  isInDeleteZone,
  calculateCompleteZoneIntensity,
  calculateDeleteZoneIntensity,
} from '../utils/zoneDetection';
import { useViewportControls } from '../hooks/useViewportControls';
import { useLatest } from '../hooks/useLatest';

interface SkyCanvasProps {
  className?: string;
  skyData: SkyData | null;
  onCloudClick?: (node: CloudNode) => void;
  onCloudRightClick?: (node: CloudNode) => void;
  onBackgroundClick?: () => void;
  onCloudReassign?: (cloudId: string, cloudType: string, targetId: string, targetType: string) => void;
  onCloudDelete?: (cloudId: string, cloudType: string) => void;
  onCloudComplete?: (cloudId: string, cloudType: string) => void;
  onMilestonePositionChange?: (id: string, x: number, y: number) => void;
  focusedNode?: CloudNode | null;
  nightMode?: boolean;
}

export interface SkyCanvasHandle {
  dissolveCloud: (id: string) => void;
  getDropContext: (screenX: number, screenY: number) => { type: 'sky' | 'milestone' | 'task'; targetId?: string } | null;
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number } | null;
  resize: () => void;
  refreshFocusLayout: () => void;
}

// Destructure constants for cleaner usage
const { LONG_PRESS_DURATION_MS } = INTERACTION;

export const SkyCanvas = forwardRef<SkyCanvasHandle, SkyCanvasProps>(function SkyCanvas({
  className,
  skyData,
  onCloudClick,
  onCloudRightClick,
  onBackgroundClick,
  onCloudReassign,
  onCloudDelete,
  onCloudComplete,
  onMilestonePositionChange,
  focusedNode,
  nightMode = false,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const cloudsContainerRef = useRef<Container | null>(null);
  const focusOverlayRef = useRef<Graphics | null>(null);
  const cloudsRef = useRef<Map<string, Cloud>>(new Map());
  const nodesRef = useRef<CloudNode[]>([]);
  const focusedNodeRef = useRef<CloudNode | null>(null);
  const prevFocusedIdRef = useRef<string | null>(null);
  // Use useLatest to avoid stale closure issues - always has latest callbacks
  const callbacksRef = useLatest({ onCloudClick, onCloudRightClick, onBackgroundClick, onCloudReassign, onCloudDelete, onCloudComplete, onMilestonePositionChange });
  const [appReady, setAppReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Drag state
  const draggedCloudRef = useRef<Cloud | null>(null);
  const dragStartTimeRef = useRef<number>(0);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentDropTargetRef = useRef<Cloud | null>(null);
  const inDeleteZoneRef = useRef<boolean>(false);
  const inCompleteZoneRef = useRef<boolean>(false);

  // Delete/complete zone visual state
  const [isDraggingCloud, setIsDraggingCloud] = useState(false);
  const [deleteZoneIntensity, setDeleteZoneIntensity] = useState(0); // 0-1 based on proximity to edge
  const [completeZoneIntensity, setCompleteZoneIntensity] = useState(0); // 0-1 based on proximity to top edge

  // Text resolution tracking for zoom-based sharpness
  const lastAppliedTextZoomRef = useRef<number>(1);

  // Viewport controls (zoom/pan) - extracted to hook
  const {
    zoomRef: manualZoomRef,
    panRef: manualPanRef,
    handleWheelZoom,
    startPinchZoom,
    updatePinchZoom,
    endPinchZoom,
    isPinching,
    applyGravity,
  } = useViewportControls();
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);

  // Viewport drag state
  const viewportDraggingRef = useRef<boolean>(false);
  const viewportDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const viewportPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastInteractionTimeRef = useRef<number>(Date.now());

  // Long-press state for mobile right-click
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressNodeRef = useRef<CloudNode | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);

  // Touch handler refs for cleanup
  const touchHandlersRef = useRef<{
    touchstart: (e: TouchEvent) => void;
    touchmove: (e: TouchEvent) => void;
    touchend: (e: TouchEvent) => void;
  } | null>(null);

  const tickerCallbackRef = useRef<((ticker: Ticker) => void) | null>(null);

  // Keep focused node ref updated
  useEffect(() => {
    focusedNodeRef.current = focusedNode || null;
  }, [focusedNode]);

  // Focus token to prevent stale RAF callbacks
  const focusTokenRef = useRef(0);

  // Focus Layout Engine: authoritative positions for focused subtree
  // Maps node ID -> {x, y} for all nodes in focused subtree (parent + children)
  const focusLayoutPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Refresh focus layout: compute sizes and orbit positions
  // Called on focus entry AND when nodes change while in focus
  const refreshFocusLayout = useCallback(() => {
    const focusedNode = focusedNodeRef.current;
    if (!focusedNode) return;

    const children = nodesRef.current.filter(n => n.parentId === focusedNode.id);
    const parentNode = nodesRef.current.find(n => n.id === focusedNode.id);

    if (!parentNode || children.length === 0) {
      // No children, just store parent position
      if (parentNode) {
        focusLayoutPositionsRef.current.clear();
        focusLayoutPositionsRef.current.set(parentNode.id, { x: parentNode.x, y: parentNode.y });
      }
      return;
    }

    // Increment focus token to invalidate stale RAF callbacks
    focusTokenRef.current++;
    const currentToken = focusTokenRef.current;

    // RAF - compute sizes and orbit after render (ensures Pixi bounds are valid)
    requestAnimationFrame(() => {
      // Abort if focus changed while waiting for RAF
      if (focusTokenRef.current !== currentToken) {
        return;
      }

      const parentCloud = cloudsRef.current.get(parentNode.id);
      if (!parentCloud) return;

      // Force parent to compute requiredCoverageR (bounds should be valid after RAF)
      parentCloud.computeRequiredSizeNow("focused");

      // Force all children to compute requiredCoverageR
      for (const child of children) {
        const childCloud = cloudsRef.current.get(child.id);
        if (childCloud) {
          childCloud.computeRequiredSizeNow("child");
        }
      }

      // Get max child coverage radius
      let maxChildR = 0;
      for (const child of children) {
        const childCloud = cloudsRef.current.get(child.id);
        if (childCloud) {
          const childCoverageR = childCloud.requiredCoverageR || (child.radius + 40);
          maxChildR = Math.max(maxChildR, childCoverageR);
        } else {
          maxChildR = Math.max(maxChildR, child.radius + 40);
        }
      }

      const parentCoverageR = parentCloud.requiredCoverageR || parentNode.radius;

      // Calculate orbit radius using morphed sizes
      const ORBIT_GAP = 15; // Reduced for tighter orbit around focused node
      let orbitRadius = parentCoverageR + ORBIT_GAP + maxChildR;

      // Density guard: ensure children don't overlap on ring
      const minArc = maxChildR * 2 + 30;
      const orbitRadius_byArc = (children.length * minArc) / (2 * Math.PI);
      orbitRadius = Math.max(orbitRadius, orbitRadius_byArc);

      // Position children in circular arrangement around parent
      children.forEach((child, i) => {
        const angle = -Math.PI / 2 + (i / children.length) * Math.PI * 2;
        child.x = parentNode.x + Math.cos(angle) * orbitRadius;
        child.y = parentNode.y + Math.sin(angle) * orbitRadius;
        child.vx = 0;
        child.vy = 0;
      });

      // Store positions in focus layout map (authoritative)
      focusLayoutPositionsRef.current.clear();
      focusLayoutPositionsRef.current.set(parentNode.id, { x: parentNode.x, y: parentNode.y });
      children.forEach((child) => {
        focusLayoutPositionsRef.current.set(child.id, { x: child.x, y: child.y });
      });

      console.log('[FocusEntry]',
        'parent', parentNode.id.substring(0, 8),
        'children', children.length,
        'orbitR', orbitRadius.toFixed(1)
      );
    });
  }, []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    dissolveCloud: (id: string) => {
      const cloud = cloudsRef.current.get(id);
      if (cloud) {
        cloud.dissolve();
      }
    },
    resize: () => {
      appRef.current?.resize();
    },
    getDropContext: (screenX: number, screenY: number) => {
      const cloudsContainer = cloudsContainerRef.current;
      if (!cloudsContainer) return null;

      // Transform screen coordinates to local canvas coordinates
      const canvas = appRef.current?.canvas;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const canvasX = screenX - rect.left;
      const canvasY = screenY - rect.top;

      // Transform to world coordinates
      const localX = (canvasX - cloudsContainer.x) / cloudsContainer.scale.x;
      const localY = (canvasY - cloudsContainer.y) / cloudsContainer.scale.y;

      // Find what's under this point
      const node = findNodeAt(nodesRef.current, localX, localY);

      if (!node) {
        return { type: 'sky' };
      }

      if (node.type === 'milestone') {
        return { type: 'milestone', targetId: node.id };
      }

      if (node.type === 'task') {
        return { type: 'task', targetId: node.id };
      }

      // Dropped on subtask - treat as dropped on its parent task
      if (node.type === 'subtask' && node.parentId) {
        return { type: 'task', targetId: node.parentId };
      }

      return { type: 'sky' };
    },
    screenToWorld: (screenX: number, screenY: number) => {
      const cloudsContainer = cloudsContainerRef.current;
      if (!cloudsContainer) return null;

      const canvas = appRef.current?.canvas;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const canvasX = screenX - rect.left;
      const canvasY = screenY - rect.top;

      // Transform to world coordinates
      const localX = (canvasX - cloudsContainer.x) / cloudsContainer.scale.x;
      const localY = (canvasY - cloudsContainer.y) / cloudsContainer.scale.y;

      return { x: localX, y: localY };
    },
    refreshFocusLayout: () => {
      refreshFocusLayout();
    }
  }), [refreshFocusLayout]);

  // Focus entry/exit effect
  useEffect(() => {
    if (focusedNode && focusedNode.id !== prevFocusedIdRef.current) {
      // Entering focus mode - refresh layout
      refreshFocusLayout();
    } else if (!focusedNode && prevFocusedIdRef.current) {
      // Exiting focus mode - clear layout map
      focusLayoutPositionsRef.current.clear();
    }
    prevFocusedIdRef.current = focusedNode?.id ?? null;
  }, [focusedNode?.id, refreshFocusLayout]);

  const nightModeRef = useRef(nightMode);
  useEffect(() => {
    nightModeRef.current = nightMode;
  }, [nightMode]);

  // Update sky gradient based on sun brightness and night mode
  const updateSkyGradient = useCallback((app: Application, brightness: number, isNightMode: boolean) => {
    if (isNightMode) {
      // Night mode: darker blues/purples
      const r = Math.round(20 + (40 - 20) * brightness);
      const g = Math.round(30 + (60 - 30) * brightness);
      const b = Math.round(60 + (100 - 60) * brightness);
      const color = (r << 16) | (g << 8) | b;
      app.renderer.background.color = color;
    } else {
      // Day mode: sky blues
      const r = Math.round(74 + (135 - 74) * brightness);
      const g = Math.round(144 + (206 - 144) * brightness);
      const b = Math.round(217 + (235 - 217) * brightness);
      const color = (r << 16) | (g << 8) | b;
      app.renderer.background.color = color;
    }
  }, []);

  // Helper to find drop target at position
  const findDropTarget = useCallback((draggedCloud: Cloud, x: number, y: number): Cloud | null => {
    let bestTarget: Cloud | null = null;
    let bestDist = Infinity;

    cloudsRef.current.forEach((cloud) => {
      if (cloud === draggedCloud) return;
      if (!cloud.canAcceptDrop(draggedCloud)) return;

      const dx = x - cloud.x;
      const dy = y - cloud.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Must be within cloud radius to count as valid drop
      if (dist < cloud.node.radius && dist < bestDist) {
        bestDist = dist;
        bestTarget = cloud;
      }
    });

    return bestTarget;
  }, []);

  // Update drop target highlights
  const updateDropTargetHighlights = useCallback((draggedCloud: Cloud | null, mouseX: number, mouseY: number) => {
    // Clear all highlights first
    cloudsRef.current.forEach((cloud) => {
      cloud.setDropTargetHighlight(false);
    });

    if (!draggedCloud) {
      currentDropTargetRef.current = null;
      return;
    }

    const dropTarget = findDropTarget(draggedCloud, mouseX, mouseY);
    if (dropTarget) {
      dropTarget.setDropTargetHighlight(true);
    }
    currentDropTargetRef.current = dropTarget;
  }, [findDropTarget]);

  // Initialize Pixi app once
  useEffect(() => {
    if (!containerRef.current) return;

    const initPixi = async () => {
      try {
        const app = new Application();

        await app.init({
          background: '#4A90D9',
          resizeTo: containerRef.current!,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        containerRef.current!.appendChild(app.canvas);
        appRef.current = app;

      // Prevent browser context menu on canvas
      app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // Create clouds container with sortable children for z-ordering
      const cloudsContainer = new Container();
      cloudsContainer.sortableChildren = true;
      cloudsContainerRef.current = cloudsContainer;
      app.stage.addChild(cloudsContainer);

      // Create focus overlay (dark background for focus mode)
      const focusOverlay = new Graphics();
      focusOverlay.zIndex = -10; // Behind all clouds
      focusOverlayRef.current = focusOverlay;
      cloudsContainer.addChild(focusOverlay);

      // Handle pointer events on stage for background clicks and drag
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;

      // Mousewheel zoom handler (using viewport controls hook)
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();

        // Don't allow zoom while focused on a node
        if (focusedNodeRef.current) return;

        lastInteractionTimeRef.current = Date.now();

        // Use hook's handleWheelZoom for zoom-toward-mouse logic
        handleWheelZoom(
          e.deltaY,
          e.offsetX,
          e.offsetY,
          cloudsContainer.x,
          cloudsContainer.y,
          cloudsContainer.scale.x
        );
      };

      wheelHandlerRef.current = handleWheel;
      app.canvas.addEventListener('wheel', handleWheel, { passive: false });

      // Helper to clear long-press timer
      const clearLongPress = () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressNodeRef.current = null;
      };

      // Pinch-to-zoom touch handlers (using viewport controls hook)
      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          // Cancel any cloud drag in progress
          if (draggedCloudRef.current) {
            draggedCloudRef.current.endDrag();
            endDragPhysics();
            draggedCloudRef.current = null;
            setIsDraggingCloud(false);
          }
          clearLongPress();

          const touch1 = e.touches[0];
          const touch2 = e.touches[1];
          const dx = touch2.clientX - touch1.clientX;
          const dy = touch2.clientY - touch1.clientY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Get center point of the two touches
          const rect = app.canvas.getBoundingClientRect();
          const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
          const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

          // Use hook's startPinchZoom
          startPinchZoom(distance, centerX, centerY);
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && isPinching()) {
          e.preventDefault();
          lastInteractionTimeRef.current = Date.now();

          const touch1 = e.touches[0];
          const touch2 = e.touches[1];
          const dx = touch2.clientX - touch1.clientX;
          const dy = touch2.clientY - touch1.clientY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Use hook's updatePinchZoom
          updatePinchZoom(
            distance,
            cloudsContainer.x,
            cloudsContainer.y,
            cloudsContainer.scale.x
          );
        }
      };

      const handleTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) {
          endPinchZoom();
        }
      };

      touchHandlersRef.current = {
        touchstart: handleTouchStart,
        touchmove: handleTouchMove,
        touchend: handleTouchEnd,
      };

      app.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      app.canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      app.canvas.addEventListener('touchend', handleTouchEnd);

      // Global pointer move for drag
      app.stage.on('pointermove', (e) => {
        // Clear long-press if user moves significantly
        if (longPressTimerRef.current) {
          clearLongPress();
        }

        const draggedCloud = draggedCloudRef.current;
        if (!draggedCloud) return;

        // Mark interaction to prevent viewport gravity
        lastInteractionTimeRef.current = Date.now();

        // Transform coordinates
        const localX = (e.global.x - cloudsContainer.x) / cloudsContainer.scale.x;
        const localY = (e.global.y - cloudsContainer.y) / cloudsContainer.scale.y;

        draggedCloud.updateDrag(localX, localY);

        // Update physics drag state - this makes other clouds react!
        updateDragPhysics(localX, localY);

        // Update drop target highlighting
        updateDropTargetHighlights(draggedCloud, localX, localY);

        // Check complete zone (top edge) and delete zone (other edges)
        inCompleteZoneRef.current = isInCompleteZone(e.global.x, e.global.y, app.screen.width, app.screen.height);
        inDeleteZoneRef.current = isInDeleteZone(e.global.x, e.global.y, app.screen.width, app.screen.height);

        // Calculate visual intensities
        const completeIntensity = calculateCompleteZoneIntensity(e.global.x, e.global.y, app.screen.width, app.screen.height);
        const deleteIntensity = calculateDeleteZoneIntensity(e.global.x, e.global.y, app.screen.width, app.screen.height);
        setCompleteZoneIntensity(completeIntensity);
        setDeleteZoneIntensity(deleteIntensity);

        // Update cloud visual feedback - complete takes priority over danger
        draggedCloud.setCompleteLevel(completeIntensity);
        draggedCloud.setDangerLevel(deleteIntensity);
      });

      // Global pointer up for drop
      app.stage.on('pointerup', (e) => {
        // Clear long-press timer
        clearLongPress();

        // If long-press was triggered, don't process as normal click
        if (longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false;
          draggedCloudRef.current = null;
          setIsDraggingCloud(false);
          return;
        }

        const draggedCloud = draggedCloudRef.current;
        if (!draggedCloud) return;

        const dropPos = draggedCloud.endDrag();

        // End physics drag - get the release velocity for momentum
        const releaseVelocity = endDragPhysics();

        // Apply release velocity to the node for momentum after release (skoot!)
        const node = nodesRef.current.find(n => n.id === draggedCloud.node.id);
        if (node) {
          node.vx = releaseVelocity.vx * LAYOUT.RELEASE_VELOCITY_MULTIPLIER;
          node.vy = releaseVelocity.vy * LAYOUT.RELEASE_VELOCITY_MULTIPLIER;

          // If in focus mode and this is part of focused subtree, update layout map
          if (focusLayoutPositionsRef.current.has(node.id)) {
            focusLayoutPositionsRef.current.set(node.id, { x: node.x, y: node.y });
          }

          // Save milestone position to database after drag (not click)
          // We'll check for significant drag distance later, but prepare the node reference
        }

        // Store drop target before clearing highlights
        const dropTargetCloud = currentDropTargetRef.current;

        // Clear highlights
        updateDropTargetHighlights(null, 0, 0);

        // Check if this was a click (short drag with minimal movement)
        const dragDuration = Date.now() - dragStartTimeRef.current;
        const dragDistance = Math.sqrt(
          Math.pow(dropPos.x - dragStartPosRef.current.x, 2) +
          Math.pow(dropPos.y - dragStartPosRef.current.y, 2)
        );

        // More forgiving click detection - longer time and distance threshold
        const wasClick = dragDuration < 300 && dragDistance < 15;

        if (wasClick) {
          // Treat as click
          if (e.button === 2) {
            if (callbacksRef.current.onCloudRightClick) {
              callbacksRef.current.onCloudRightClick(draggedCloud.node);
            }
          } else if (callbacksRef.current.onCloudClick) {
            callbacksRef.current.onCloudClick(draggedCloud.node);
          }
        } else {
          // Re-check zone state at release time using intensity (matches visual label threshold)
          const releaseX = e.global.x;
          const releaseY = e.global.y;
          const completeIntensity = calculateCompleteZoneIntensity(releaseX, releaseY, app.screen.width, app.screen.height);
          const deleteIntensity = calculateDeleteZoneIntensity(releaseX, releaseY, app.screen.width, app.screen.height);

          // Trigger threshold - same as when visual label appears (intensity >= 0.8)
          const ZONE_TRIGGER_THRESHOLD = 0.8;

          // Check if in complete zone (top edge) - only for tasks/subtasks
          if (completeIntensity >= ZONE_TRIGGER_THRESHOLD && draggedCloud.node.type !== 'milestone') {
            if (callbacksRef.current.onCloudComplete) {
              callbacksRef.current.onCloudComplete(draggedCloud.node.id, draggedCloud.node.type);
            }
          }
          // Check if in delete zone (other edges)
          else if (deleteIntensity >= ZONE_TRIGGER_THRESHOLD) {
            if (callbacksRef.current.onCloudDelete) {
              callbacksRef.current.onCloudDelete(draggedCloud.node.id, draggedCloud.node.type);
            }
          }
          // Check if dropped on valid target
          else if (dropTargetCloud) {
            const target = dropTargetCloud;
            if (callbacksRef.current.onCloudReassign) {
              callbacksRef.current.onCloudReassign(
                draggedCloud.node.id,
                draggedCloud.node.type,
                target.node.id,
                target.node.type
              );
            }
          }
          // Otherwise, cloud was just dragged and released - save milestone position
          else if (node && node.type === 'milestone' && callbacksRef.current.onMilestonePositionChange) {
            callbacksRef.current.onMilestonePositionChange(node.id, node.x, node.y);
          }
        }

        draggedCloudRef.current = null;
        inDeleteZoneRef.current = false;
        inCompleteZoneRef.current = false;

        // Reset zone visuals
        setIsDraggingCloud(false);
        setDeleteZoneIntensity(0);
        setCompleteZoneIntensity(0);
      });

      // Pointer up outside (in case pointer leaves canvas)
      app.stage.on('pointerupoutside', () => {
        // Clear long-press timer
        clearLongPress();
        longPressTriggeredRef.current = false;

        const draggedCloud = draggedCloudRef.current;
        if (draggedCloud) {
          draggedCloud.endDrag();
          endDragPhysics(); // Also end physics drag
          updateDropTargetHighlights(null, 0, 0);
        }
        draggedCloudRef.current = null;
        inDeleteZoneRef.current = false;
        inCompleteZoneRef.current = false;

        // Reset zone visuals
        setIsDraggingCloud(false);
        setDeleteZoneIntensity(0);
        setCompleteZoneIntensity(0);
      });

      app.stage.on('pointerdown', (e) => {
        // Transform coordinates based on container scale/position
        const cloudsContainer = cloudsContainerRef.current;
        if (!cloudsContainer) return;

        const localX = (e.global.x - cloudsContainer.x) / cloudsContainer.scale.x;
        const localY = (e.global.y - cloudsContainer.y) / cloudsContainer.scale.y;

        // Use larger hit area for touch events
        const isTouch = e.pointerType === 'touch';
        const node = findNodeAt(nodesRef.current, localX, localY, isTouch);
        if (!node) {
          // No cloud clicked - track for viewport drag or background click
          viewportDraggingRef.current = true;
          viewportDragStartRef.current = { x: e.global.x, y: e.global.y };
          viewportPanStartRef.current = { ...manualPanRef.current };
          lastInteractionTimeRef.current = Date.now();
        }
      });

      // Handle viewport drag movement
      app.stage.on('globalpointermove', (e) => {
        if (!viewportDraggingRef.current) return;
        if (draggedCloudRef.current) return; // Don't pan while dragging a cloud
        if (focusedNodeRef.current) return; // Don't pan when focused (but still track for click detection)

        const dx = e.global.x - viewportDragStartRef.current.x;
        const dy = e.global.y - viewportDragStartRef.current.y;

        manualPanRef.current.x = viewportPanStartRef.current.x + dx;
        manualPanRef.current.y = viewportPanStartRef.current.y + dy;
        lastInteractionTimeRef.current = Date.now();
      });

      // End viewport drag on pointer up
      const endViewportDrag = (e: { global: { x: number; y: number } }) => {
        if (viewportDraggingRef.current) {
          // Check if this was a click (minimal movement)
          const dx = e.global.x - viewportDragStartRef.current.x;
          const dy = e.global.y - viewportDragStartRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // If minimal movement, treat as background click
          if (distance < 5 && callbacksRef.current.onBackgroundClick) {
            callbacksRef.current.onBackgroundClick();
          }

          viewportDraggingRef.current = false;
        }
      };

      app.stage.on('pointerup', endViewportDrag);
      app.stage.on('pointerupoutside', endViewportDrag);

      // Helper to update text resolutions based on zoom level (for sharp text at all zoom levels)
      const updateTextResolutions = (zoom: number) => {
        if (Math.abs(zoom - lastAppliedTextZoomRef.current) < 0.05) return;
        lastAppliedTextZoomRef.current = zoom;

        cloudsRef.current.forEach((cloud) => {
          cloud.setLabelZoom(zoom);
        });
      };

      // PERF: Animation loop with idle detection
      const tickerCallback = (ticker: Ticker) => {
        const deltaTime = ticker.deltaTime;

        // PERF: Increment frame counter once per frame (used for idle detection frame skipping)
        Cloud.incrementFrame();

        // Focus Layout Engine: Apply authoritative positions BEFORE physics
        if (focusedNodeRef.current && focusLayoutPositionsRef.current.size > 0) {
          nodesRef.current.forEach((node) => {
            const layoutPos = focusLayoutPositionsRef.current.get(node.id);
            if (layoutPos) {
              // Only enforce if not being dragged
              const isDragged = draggedCloudRef.current?.node.id === node.id;
              if (!isDragged) {
                node.x = layoutPos.x;
                node.y = layoutPos.y;
                node.vx = 0;
                node.vy = 0;
              }
            }
          });
        }

        // Apply physics to nodes (focused subtree positions are managed by layout engine)
        if (nodesRef.current.length > 0) {
          // Pass focused subtree IDs so physics skips them entirely
          // Layout engine is authoritative for these positions
          const focusedSubtreeIds = focusLayoutPositionsRef.current.size > 0
            ? new Set(focusLayoutPositionsRef.current.keys())
            : undefined;

          applyForces(
            nodesRef.current,
            focusedNodeRef.current?.id,
            focusedNodeRef.current !== null,
            focusedSubtreeIds
          );
        }

        // Update clouds with shared timestamp to avoid multiple Date.now() calls
        // NOTE: Frame skipping removed - causes choppy hover/breathing animations
        // The GPU handles 60fps fine for this app's complexity
        const frameTime = Date.now();
        cloudsRef.current.forEach((cloud) => {
          cloud.update(deltaTime, frameTime);
        });

        // Handle zoom/focus using ref for current value
        const currentFocusedNode = focusedNodeRef.current;
        if (currentFocusedNode) {
          // Calculate zoom dynamically to fit all children within viewport
          let contentRadius = currentFocusedNode.radius;
          const focusedCloud = cloudsRef.current.get(currentFocusedNode.id);
          const focusX = focusedCloud?.x ?? currentFocusedNode.x;
          const focusY = focusedCloud?.y ?? currentFocusedNode.y;

          // Find max distance from center to any child in focus layout
          focusLayoutPositionsRef.current.forEach((pos, id) => {
            if (id !== currentFocusedNode.id) {
              const dx = pos.x - focusX;
              const dy = pos.y - focusY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              // Add child radius estimate (get from cloud or use default)
              const childCloud = cloudsRef.current.get(id);
              const childR = childCloud?.requiredCoverageR ?? 60;
              contentRadius = Math.max(contentRadius, dist + childR + 20); // 20px padding
            }
          });

          // Calculate zoom to fit content with padding
          const viewportMin = Math.min(app.screen.width, app.screen.height);
          const padding = 60; // Edge padding
          const idealScale = (viewportMin - padding * 2) / (contentRadius * 2);

          // Clamp to reasonable range and use as target
          const targetScale = Math.max(0.8, Math.min(2.5, idealScale));

          // Framerate-independent interpolation: at 60fps deltaTime=1, at 30fps deltaTime=2
          const focusLerp = 1 - Math.pow(1 - 0.1, deltaTime);
          cloudsContainer.scale.x += (targetScale - cloudsContainer.scale.x) * focusLerp;
          cloudsContainer.scale.y += (targetScale - cloudsContainer.scale.y) * focusLerp;

          // Center on focused node
          const targetX = app.screen.width / 2 - focusX * cloudsContainer.scale.x;
          const targetY = app.screen.height / 2 - focusY * cloudsContainer.scale.y;

          cloudsContainer.x += (targetX - cloudsContainer.x) * focusLerp;
          cloudsContainer.y += (targetY - cloudsContainer.y) * focusLerp;

          // Update text resolutions for sharp rendering at current zoom
          updateTextResolutions(cloudsContainer.scale.x);

          // Draw dark overlay in focus mode
          if (focusOverlayRef.current) {
            focusOverlayRef.current.clear();
            focusOverlayRef.current.fill({ color: 0x000000, alpha: 0.4 });
            // Draw a large rectangle covering the viewport in world coordinates
            const scale = cloudsContainer.scale.x;
            const worldLeft = -cloudsContainer.x / scale - 1000;
            const worldTop = -cloudsContainer.y / scale - 1000;
            const worldWidth = app.screen.width / scale + 2000;
            const worldHeight = app.screen.height / scale + 2000;
            focusOverlayRef.current.rect(worldLeft, worldTop, worldWidth, worldHeight);
          }
        } else {
          // Overview mode: use manual zoom/pan from mousewheel
          // But apply gentle gravity toward ideal "show all" position when idle

          // Calculate ideal viewport to show all clouds
          let idealScale = 1;
          let idealX = 0;
          let idealY = 0;

          if (nodesRef.current.length > 0) {
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            nodesRef.current.forEach(node => {
              const cloud = cloudsRef.current.get(node.id);
              const x = cloud?.x ?? node.x;
              const y = cloud?.y ?? node.y;
              const r = node.radius;

              minX = Math.min(minX, x - r);
              maxX = Math.max(maxX, x + r);
              minY = Math.min(minY, y - r);
              maxY = Math.max(maxY, y + r);
            });

            const padding = ANIMATION.OVERVIEW_PADDING;
            minX -= padding;
            maxX += padding;
            minY -= padding;
            maxY += padding;

            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;
            const scaleX = app.screen.width / contentWidth;
            const scaleY = app.screen.height / contentHeight;
            idealScale = Math.min(scaleX, scaleY);
            idealScale = Math.max(ANIMATION.OVERVIEW_MIN_ZOOM,
              Math.min(ANIMATION.OVERVIEW_MAX_ZOOM, idealScale));

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            idealX = app.screen.width / 2 - centerX * idealScale;
            idealY = app.screen.height / 2 - centerY * idealScale;
          }

          // Calculate gravity strength based on idle time
          // After 2 seconds of no interaction, start pulling gently
          const idleTime = Date.now() - lastInteractionTimeRef.current;
          const idleThreshold = 2000; // 2 seconds before gravity kicks in
          const maxGravityTime = 8000; // Full gravity after 8 more seconds
          const gravityStrength = idleTime > idleThreshold
            ? Math.min(1, (idleTime - idleThreshold) / maxGravityTime) * 0.02
            : 0;

          // Apply gravity pull toward ideal position (using viewport controls hook)
          if (gravityStrength > 0) {
            applyGravity(idealScale, idealX, idealY, gravityStrength);
          }

          const targetScale = manualZoomRef.current;
          const targetX = manualPanRef.current.x;
          const targetY = manualPanRef.current.y;

          // Framerate-independent interpolation: at 60fps deltaTime=1, at 30fps deltaTime=2
          const overviewLerp = 1 - Math.pow(1 - 0.15, deltaTime);
          cloudsContainer.scale.x += (targetScale - cloudsContainer.scale.x) * overviewLerp;
          cloudsContainer.scale.y += (targetScale - cloudsContainer.scale.y) * overviewLerp;
          cloudsContainer.x += (targetX - cloudsContainer.x) * overviewLerp;
          cloudsContainer.y += (targetY - cloudsContainer.y) * overviewLerp;

          // Update text resolutions for sharp rendering at current zoom
          updateTextResolutions(cloudsContainer.scale.x);

          // Clear overlay when not in focus mode
          if (focusOverlayRef.current) {
            focusOverlayRef.current.clear();
          }
        }
      };

      // Store ticker callback ref and add to ticker
      tickerCallbackRef.current = tickerCallback;
      app.ticker.add(tickerCallback);
      

      // Mark app as ready - this will trigger the cloud rendering effect
      setAppReady(true);
      } catch (error) {
        console.error('Failed to initialize Pixi.js:', error);
        setInitError(error instanceof Error ? error.message : 'WebGL may not be available');
      }
    };

    initPixi();

    return () => {
      if (appRef.current) {
        // Remove wheel listener before destroying
        if (wheelHandlerRef.current) {
          appRef.current.canvas.removeEventListener('wheel', wheelHandlerRef.current);
          wheelHandlerRef.current = null;
        }
        // Remove touch listeners
        if (touchHandlersRef.current) {
          appRef.current.canvas.removeEventListener('touchstart', touchHandlersRef.current.touchstart);
          appRef.current.canvas.removeEventListener('touchmove', touchHandlersRef.current.touchmove);
          appRef.current.canvas.removeEventListener('touchend', touchHandlersRef.current.touchend);
          touchHandlersRef.current = null;
        }
        // Clear any pending long-press timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        // Remove stage event listeners explicitly before destroy
        appRef.current.stage.off('pointermove');
        appRef.current.stage.off('pointerdown');
        appRef.current.stage.off('pointerup');
        appRef.current.stage.off('pointerupoutside');
        appRef.current.stage.off('globalpointermove');
        // Destroy all cloud instances properly
        cloudsRef.current.forEach((cloud) => {
          cloud.destroy();
        });
        appRef.current.destroy(true);
        appRef.current = null;
      }
      cloudsRef.current.clear();
      setAppReady(false);
    };
  }, []); // Empty deps - only run once

  // Update clouds when sky data changes OR when app becomes ready
  useEffect(() => {
    if (!appReady || !skyData || !appRef.current || !cloudsContainerRef.current) return;

    const app = appRef.current;
    const cloudsContainer = cloudsContainerRef.current;

    // Update sky color based on sun brightness and night mode
    updateSkyGradient(app, skyData.metrics.sunBrightness, nightMode);

    // Create nodes from sky data, preserving existing positions
    const nodes = createNodes(
      skyData.milestones,
      app.screen.width,
      app.screen.height,
      focusedNode,
      nodesRef.current  // Pass existing nodes to preserve positions
    );
    nodesRef.current = nodes;

    // Track existing cloud IDs
    const existingIds = new Set(cloudsRef.current.keys());
    const newIds = new Set(nodes.map((n) => n.id));
    const isInitialLoad = existingIds.size === 0;

    // Remove clouds that no longer exist
    existingIds.forEach((id) => {
      if (!newIds.has(id)) {
        const cloud = cloudsRef.current.get(id);
        if (cloud) {
          cloud.destroy(); // Clean up Pixi resources and event listeners
          cloudsContainer.removeChild(cloud);
          cloudsRef.current.delete(id);
        }
      }
    });

    // Add or update clouds
    nodes.forEach((node) => {
      try {
        let cloud = cloudsRef.current.get(node.id);

        if (!cloud) {
          // Create new cloud - skip spawn animation on initial load
          cloud = new Cloud(node, isInitialLoad);

        // Set up event handlers
        cloud.on('pointerover', () => {
          cloud!.setHovered(true);

          // Also hover neighbors
          const neighbors = findNeighbors(nodesRef.current, node);
          neighbors.forEach((neighbor) => {
            const neighborCloud = cloudsRef.current.get(neighbor.id);
            if (neighborCloud) {
              neighborCloud.setHovered(true, true);
            }
          });
        });

        cloud.on('pointerout', () => {
          cloud!.setHovered(false);

          // Unhover all clouds
          cloudsRef.current.forEach((c) => c.setHovered(false));
        });

        // Store reference for closures
        const cloudRef = cloud;

        cloudRef.on('pointerdown', (e) => {
          e.stopPropagation();

          // CRITICAL: Prevent drag/focus if clicking checkbox (or its descendants)
          if (cloudRef.isCheckboxEventTarget(e.target)) {
            return; // Let checkbox handle this event
          }

          // Prevent dragging focused clouds
          if (focusedNodeRef.current && cloudRef.node.id === focusedNodeRef.current.id) {
            return;
          }

          // Transform coordinates for drag start
          const cloudsContainer = cloudsContainerRef.current;
          if (!cloudsContainer) return;

          const localX = (e.global.x - cloudsContainer.x) / cloudsContainer.scale.x;
          const localY = (e.global.y - cloudsContainer.y) / cloudsContainer.scale.y;

          // Start long-press timer for mobile right-click
          longPressTriggeredRef.current = false;
          longPressNodeRef.current = cloudRef.node;
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
          }
          longPressTimerRef.current = setTimeout(() => {
            // Long-press triggered - treat as right-click
            longPressTriggeredRef.current = true;
            if (callbacksRef.current.onCloudRightClick && longPressNodeRef.current) {
              callbacksRef.current.onCloudRightClick(longPressNodeRef.current);
            }
            // Cancel drag
            if (draggedCloudRef.current) {
              draggedCloudRef.current.endDrag();
              endDragPhysics();
              draggedCloudRef.current = null;
              setIsDraggingCloud(false);
            }
            longPressTimerRef.current = null;
            longPressNodeRef.current = null;
          }, LONG_PRESS_DURATION_MS);

          // Start drag tracking (click vs drag determined on release)
          draggedCloudRef.current = cloudRef;
          dragStartTimeRef.current = Date.now();
          dragStartPosRef.current = { x: localX, y: localY };
          cloudRef.startDrag(localX, localY);

          // Start physics drag - this makes nearby clouds react!
          startDragPhysics(cloudRef.node.id, localX, localY);

          // Enable delete zone visuals
          setIsDraggingCloud(true);
        });

        // Prevent context menu on right-click
        cloudRef.on('rightdown', (e) => {
          const nativeEvent = e.nativeEvent as PointerEvent;
          if (nativeEvent) {
            nativeEvent.preventDefault();
          }
        });

        cloudRef.on('rightclick', (e) => {
          e.stopPropagation();
          if (callbacksRef.current.onCloudRightClick) {
            callbacksRef.current.onCloudRightClick(cloudRef.node);
          }
        });

        cloudsContainer.addChild(cloud);
        cloudsRef.current.set(node.id, cloud);
      } else {
        // Update existing cloud
        cloud.updateNode(node);
      }

      // Clear all focus states when focus changes (before setting new states)
      if (focusedNode && focusedNode.id !== prevFocusedIdRef.current) {
        cloudsRef.current.forEach((c) => {
          c.resetFocus();
        });
      }

      // Update focus state and z-ordering
      if (focusedNode) {
        const isFocusedNode = node.id === focusedNode.id;
        const isChildOfFocused = node.parentId === focusedNode.id;

        // Set focus states separately
        if (isFocusedNode) {
          cloud.setFocused(true);
          cloud.setChildOfFocused(false);
          cloud.zIndex = 100; // Focused node on top
          // Set completion callback for focused node
          cloud.setOnComplete(() => {
            if (callbacksRef.current.onCloudComplete) {
              callbacksRef.current.onCloudComplete(node.id, node.type);
            }
          });
        } else if (isChildOfFocused) {
          cloud.setFocused(false);
          cloud.setChildOfFocused(true);
          cloud.zIndex = 50;  // Children below focused
          // Set completion callback for children
          cloud.setOnComplete(() => {
            if (callbacksRef.current.onCloudComplete) {
              callbacksRef.current.onCloudComplete(node.id, node.type);
            }
          });
        } else {
          cloud.setFocused(false);
          cloud.setChildOfFocused(false);
          cloud.zIndex = 0;   // Background nodes
          cloud.setOnComplete(null);
        }
      } else {
        cloud.resetFocus();
        cloud.zIndex = 0;
        cloud.setOnComplete(null);
      }

      // Update neglect level for visual feedback
      // Tasks/subtasks inherit their milestone's neglect level
      let neglectLevel = 0;
      if (skyData.neglectScores) {
        if (node.type === 'milestone') {
          neglectLevel = skyData.neglectScores[node.id] || 0;
        } else if (node.parentId) {
          // For tasks, find their milestone's neglect score
          // For subtasks, traverse up to find the milestone
          const parentNode = nodes.find(n => n.id === node.parentId);
          if (parentNode) {
            if (parentNode.type === 'milestone') {
              neglectLevel = skyData.neglectScores[parentNode.id] || 0;
            } else if (parentNode.parentId) {
              // Subtask -> task -> milestone
              neglectLevel = skyData.neglectScores[parentNode.parentId] || 0;
            }
          }
        }
      }
      // Always set neglect level (even if 0) to ensure cloud is properly redrawn
      cloud.setNeglectLevel(neglectLevel);
      } catch (err) {
        // Error boundary: log and continue with other clouds
        console.error(`Failed to render cloud ${node.id} (${node.type}):`, err);
        // Attempt to clean up broken cloud if it exists
        const brokenCloud = cloudsRef.current.get(node.id);
        if (brokenCloud) {
          try {
            brokenCloud.destroy();
            cloudsContainer.removeChild(brokenCloud);
          } catch {
            // Ignore cleanup errors
          }
          cloudsRef.current.delete(node.id);
        }
      }
    });

    // Center viewport on initial load
    if (isInitialLoad && nodes.length > 0) {
      // Calculate bounding box of all nodes
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      nodes.forEach(node => {
        const x = node.x;
        const y = node.y;
        const r = node.radius;

        minX = Math.min(minX, x - r);
        maxX = Math.max(maxX, x + r);
        minY = Math.min(minY, y - r);
        maxY = Math.max(maxY, y + r);
      });

      const padding = ANIMATION.OVERVIEW_PADDING;
      minX -= padding;
      maxX += padding;
      minY -= padding;
      maxY += padding;

      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const scaleX = app.screen.width / contentWidth;
      const scaleY = app.screen.height / contentHeight;
      let idealScale = Math.min(scaleX, scaleY);
      idealScale = Math.max(ANIMATION.OVERVIEW_MIN_ZOOM,
        Math.min(ANIMATION.OVERVIEW_MAX_ZOOM, idealScale));

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const idealX = app.screen.width / 2 - centerX * idealScale;
      const idealY = app.screen.height / 2 - centerY * idealScale;

      // Set viewport immediately to centered position
      manualZoomRef.current = idealScale;
      manualPanRef.current.x = idealX;
      manualPanRef.current.y = idealY;

      // Also apply to container immediately so there's no visual jump
      cloudsContainer.scale.set(idealScale);
      cloudsContainer.x = idealX;
      cloudsContainer.y = idealY;
    }

    // CRITICAL: Refresh focus layout after nodes rebuild if in focus mode
    // This ensures layout survives CRUD operations (e.g., adding a task)
    if (focusedNode) {
      refreshFocusLayout();
    }
  }, [appReady, skyData, focusedNode, nightMode, updateSkyGradient, refreshFocusLayout]);

  // Show error fallback if Pixi failed to initialize
  if (initError) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-slate-800 ${className || ''}`}>
        <div className="text-center text-white p-8">
          <h2 className="text-xl font-semibold mb-2">Unable to load canvas</h2>
          <p className="text-slate-400 mb-4">{initError}</p>
          <p className="text-sm text-slate-500">Try refreshing the page or using a different browser.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative ${className || ''}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Complete zone visual indicator - white/green gradient at TOP edge */}
      {isDraggingCloud && completeZoneIntensity > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-100"
          style={{ opacity: completeZoneIntensity }}
        >
          {/* Top edge - complete zone (white/green) */}
          <div
            className="absolute top-0 left-0 right-0 h-24"
            style={{
              background: `linear-gradient(to bottom, rgba(74, 222, 128, ${0.4 * completeZoneIntensity}), transparent)`,
            }}
          />
          {/* Subtle white glow overlay */}
          <div
            className="absolute top-0 left-0 right-0 h-16"
            style={{
              background: `linear-gradient(to bottom, rgba(255, 255, 255, ${0.3 * completeZoneIntensity}), transparent)`,
            }}
          />
          {/* Complete label when in zone - centered like delete label */}
          {completeZoneIntensity >= 0.8 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-green-500/90 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
                <svg className="w-6 h-6 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Release to complete
              </div>
            </div>
          )}
        </div>
      )}
      {/* Delete zone visual indicator - red gradient at LEFT, RIGHT, BOTTOM edges */}
      {isDraggingCloud && deleteZoneIntensity > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-100"
          style={{ opacity: deleteZoneIntensity }}
        >
          {/* Bottom edge */}
          <div
            className="absolute bottom-0 left-0 right-0 h-24"
            style={{
              background: `linear-gradient(to top, rgba(239, 68, 68, ${0.4 * deleteZoneIntensity}), transparent)`,
            }}
          />
          {/* Left edge */}
          <div
            className="absolute top-24 left-0 bottom-0 w-24"
            style={{
              background: `linear-gradient(to right, rgba(239, 68, 68, ${0.4 * deleteZoneIntensity}), transparent)`,
            }}
          />
          {/* Right edge */}
          <div
            className="absolute top-24 right-0 bottom-0 w-24"
            style={{
              background: `linear-gradient(to left, rgba(239, 68, 68, ${0.4 * deleteZoneIntensity}), transparent)`,
            }}
          />
          {/* Bottom corner intensifiers */}
          <div
            className="absolute bottom-0 left-0 w-24 h-24"
            style={{
              background: `radial-gradient(circle at bottom left, rgba(239, 68, 68, ${0.5 * deleteZoneIntensity}), transparent 70%)`,
            }}
          />
          <div
            className="absolute bottom-0 right-0 w-24 h-24"
            style={{
              background: `radial-gradient(circle at bottom right, rgba(239, 68, 68, ${0.5 * deleteZoneIntensity}), transparent 70%)`,
            }}
          />
          {/* Delete label when in zone */}
          {deleteZoneIntensity >= 0.8 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
                <svg className="w-6 h-6 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Release to delete
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
