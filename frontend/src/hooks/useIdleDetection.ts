import { useRef, useCallback } from 'react';

/**
 * Configuration for idle detection
 */
interface IdleDetectionConfig {
  /** Time in ms before considering the app idle (default: 2000) */
  idleThreshold?: number;
  /** Velocity threshold below which physics is considered settled (default: 0.1) */
  velocityThreshold?: number;
  /** Number of frames velocity must be below threshold to consider settled (default: 30) */
  settledFrames?: number;
}

/**
 * Result from useIdleDetection hook
 */
interface UseIdleDetectionResult {
  /** Mark that user activity occurred - resets idle timer */
  markActivity: () => void;
  /** Check if app is currently idle (no recent activity + physics settled) */
  isIdle: () => boolean;
  /** Check if physics has settled (velocities near zero) */
  isPhysicsSettled: () => boolean;
  /** Update physics settled state - call each frame with max velocity */
  updatePhysicsState: (maxVelocity: number) => void;
  /** Get time since last activity in ms */
  getTimeSinceActivity: () => number;
  /** Force wake up from idle (for external triggers like data refresh) */
  wakeUp: () => void;
}

/**
 * Hook for detecting when the app is idle to pause rendering.
 *
 * PERF: This hook enables render-on-demand by tracking:
 * 1. User activity (mouse, touch, keyboard)
 * 2. Physics settling (when cloud velocities approach zero)
 *
 * When both conditions are met, the render loop can be paused.
 *
 * @example
 * ```tsx
 * const idle = useIdleDetection({ idleThreshold: 2000 });
 *
 * // In event handlers:
 * onPointerMove={() => idle.markActivity()}
 *
 * // In render loop:
 * idle.updatePhysicsState(maxVelocity);
 * if (idle.isIdle()) {
 *   // Skip expensive calculations or pause ticker
 * }
 * ```
 */
export function useIdleDetection(config: IdleDetectionConfig = {}): UseIdleDetectionResult {
  const {
    idleThreshold = 2000,
    velocityThreshold = 0.1,
    settledFrames = 30,
  } = config;

  // Track last activity timestamp
  const lastActivityRef = useRef<number>(Date.now());

  // Track physics settled state
  const settledFrameCountRef = useRef<number>(0);
  const physicsSettledRef = useRef<boolean>(false);

  /**
   * Mark that user activity occurred
   * PERF: Call this on pointer/touch/keyboard events
   */
  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    // Reset settled state on activity - physics needs to re-settle
    settledFrameCountRef.current = 0;
    physicsSettledRef.current = false;
  }, []);

  /**
   * Wake up from idle state (for external triggers)
   */
  const wakeUp = useCallback(() => {
    markActivity();
  }, [markActivity]);

  /**
   * Update physics settled state
   * PERF: Call once per frame with the maximum velocity of any node
   */
  const updatePhysicsState = useCallback((maxVelocity: number) => {
    if (maxVelocity < velocityThreshold) {
      settledFrameCountRef.current++;
      if (settledFrameCountRef.current >= settledFrames) {
        physicsSettledRef.current = true;
      }
    } else {
      settledFrameCountRef.current = 0;
      physicsSettledRef.current = false;
    }
  }, [velocityThreshold, settledFrames]);

  /**
   * Check if physics has settled
   */
  const isPhysicsSettled = useCallback(() => {
    return physicsSettledRef.current;
  }, []);

  /**
   * Get time since last activity
   */
  const getTimeSinceActivity = useCallback(() => {
    return Date.now() - lastActivityRef.current;
  }, []);

  /**
   * Check if app is fully idle (no recent activity AND physics settled)
   * PERF: Use this to decide whether to pause the render loop
   */
  const isIdle = useCallback(() => {
    const timeSinceActivity = Date.now() - lastActivityRef.current;
    return timeSinceActivity > idleThreshold && physicsSettledRef.current;
  }, [idleThreshold]);

  return {
    markActivity,
    isIdle,
    isPhysicsSettled,
    updatePhysicsState,
    getTimeSinceActivity,
    wakeUp,
  };
}
