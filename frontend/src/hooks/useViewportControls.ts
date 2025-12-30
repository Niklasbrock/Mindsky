import { useRef, useCallback } from 'react';
import { ANIMATION } from '../config/animation';

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface UseViewportControlsOptions {
  /** Minimum zoom level */
  minZoom?: number;
  /** Maximum zoom level */
  maxZoom?: number;
  /** Zoom speed multiplier */
  zoomSpeed?: number;
}

interface UseViewportControlsResult {
  /** Current zoom level ref */
  zoomRef: React.MutableRefObject<number>;
  /** Current pan position ref */
  panRef: React.MutableRefObject<{ x: number; y: number }>;
  /** Handle mouse wheel zoom - returns new viewport state */
  handleWheelZoom: (deltaY: number, mouseX: number, mouseY: number, containerX: number, containerY: number, containerScale: number) => ViewportState;
  /** Handle pinch zoom start */
  startPinchZoom: (distance: number, centerX: number, centerY: number) => void;
  /** Handle pinch zoom update - returns new viewport state */
  updatePinchZoom: (distance: number, containerX: number, containerY: number, containerScale: number) => ViewportState | null;
  /** Handle pinch zoom end */
  endPinchZoom: () => void;
  /** Check if pinch zoom is active */
  isPinching: () => boolean;
  /** Apply gentle gravity toward ideal position (for auto-centering when idle) */
  applyGravity: (idealZoom: number, idealX: number, idealY: number, strength: number) => void;
  /** Get current viewport state */
  getState: () => ViewportState;
}

/**
 * Hook for managing viewport zoom and pan controls
 * Handles mousewheel zoom, pinch-to-zoom, and viewport panning
 */
export function useViewportControls(options: UseViewportControlsOptions = {}): UseViewportControlsResult {
  const {
    minZoom = ANIMATION.OVERVIEW_MIN_ZOOM,
    maxZoom = ANIMATION.OVERVIEW_MAX_ZOOM,
    zoomSpeed = 0.1,
  } = options;

  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });

  // Pinch zoom state
  const pinchStateRef = useRef<{
    active: boolean;
    initialDistance: number;
    initialZoom: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  const clampZoom = useCallback((zoom: number) => {
    return Math.max(minZoom, Math.min(maxZoom, zoom));
  }, [minZoom, maxZoom]);

  const handleWheelZoom = useCallback((
    deltaY: number,
    mouseX: number,
    mouseY: number,
    containerX: number,
    containerY: number,
    containerScale: number
  ): ViewportState => {
    const delta = deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const newZoom = clampZoom(zoomRef.current + delta);

    // Calculate world position under mouse before zoom
    const worldX = (mouseX - containerX) / containerScale;
    const worldY = (mouseY - containerY) / containerScale;

    zoomRef.current = newZoom;

    // Adjust pan to keep the same world position under the mouse
    panRef.current.x = mouseX - worldX * newZoom;
    panRef.current.y = mouseY - worldY * newZoom;

    return {
      zoom: newZoom,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  }, [clampZoom, zoomSpeed]);

  const startPinchZoom = useCallback((distance: number, centerX: number, centerY: number) => {
    pinchStateRef.current = {
      active: true,
      initialDistance: distance,
      initialZoom: zoomRef.current,
      centerX,
      centerY,
    };
  }, []);

  const updatePinchZoom = useCallback((
    distance: number,
    containerX: number,
    containerY: number,
    containerScale: number
  ): ViewportState | null => {
    if (!pinchStateRef.current?.active) return null;

    const scale = distance / pinchStateRef.current.initialDistance;
    const newZoom = clampZoom(pinchStateRef.current.initialZoom * scale);

    // Zoom toward pinch center
    const worldX = (pinchStateRef.current.centerX - containerX) / containerScale;
    const worldY = (pinchStateRef.current.centerY - containerY) / containerScale;

    zoomRef.current = newZoom;
    panRef.current.x = pinchStateRef.current.centerX - worldX * newZoom;
    panRef.current.y = pinchStateRef.current.centerY - worldY * newZoom;

    return {
      zoom: newZoom,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  }, [clampZoom]);

  const endPinchZoom = useCallback(() => {
    pinchStateRef.current = null;
  }, []);

  const isPinching = useCallback(() => {
    return pinchStateRef.current?.active ?? false;
  }, []);

  const applyGravity = useCallback((
    idealZoom: number,
    idealX: number,
    idealY: number,
    strength: number
  ) => {
    zoomRef.current += (idealZoom - zoomRef.current) * strength;
    panRef.current.x += (idealX - panRef.current.x) * strength;
    panRef.current.y += (idealY - panRef.current.y) * strength;
  }, []);

  const getState = useCallback((): ViewportState => {
    return {
      zoom: zoomRef.current,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  }, []);

  return {
    zoomRef,
    panRef,
    handleWheelZoom,
    startPinchZoom,
    updatePinchZoom,
    endPinchZoom,
    isPinching,
    applyGravity,
    getState,
  };
}
