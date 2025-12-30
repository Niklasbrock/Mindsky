import { useRef, useCallback } from 'react';
import { INTERACTION } from '../config/constants';

interface UseLongPressOptions {
  /** Callback when long press is triggered */
  onLongPress: () => void;
  /** Callback when long press is cancelled (optional) */
  onCancel?: () => void;
  /** Duration in ms before long press triggers (defaults to INTERACTION.LONG_PRESS_DURATION_MS) */
  duration?: number;
}

interface UseLongPressResult {
  /** Call when pointer/touch starts */
  start: () => void;
  /** Call when pointer/touch moves (cancels long press) */
  cancel: () => void;
  /** Call when pointer/touch ends - returns true if long press was triggered */
  end: () => boolean;
  /** Check if long press was triggered (useful for preventing click after long press) */
  wasTriggered: () => boolean;
  /** Reset the triggered state */
  resetTriggered: () => void;
}

/**
 * Hook for handling long-press interactions (mobile right-click equivalent)
 *
 * Usage:
 * ```tsx
 * const longPress = useLongPress({
 *   onLongPress: () => handleRightClick(node),
 * });
 *
 * element.on('pointerdown', () => longPress.start());
 * element.on('pointermove', () => longPress.cancel());
 * element.on('pointerup', () => {
 *   if (longPress.wasTriggered()) {
 *     longPress.resetTriggered();
 *     return; // Don't process as click
 *   }
 *   // Handle as normal click
 * });
 * ```
 */
export function useLongPress(options: UseLongPressOptions): UseLongPressResult {
  const { onLongPress, onCancel, duration = INTERACTION.LONG_PRESS_DURATION_MS } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onCancel?.();
  }, [onCancel]);

  const start = useCallback(() => {
    triggeredRef.current = false;
    cancel(); // Clear any existing timer

    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      onLongPress();
      timerRef.current = null;
    }, duration);
  }, [cancel, duration, onLongPress]);

  const end = useCallback(() => {
    cancel();
    return triggeredRef.current;
  }, [cancel]);

  const wasTriggered = useCallback(() => {
    return triggeredRef.current;
  }, []);

  const resetTriggered = useCallback(() => {
    triggeredRef.current = false;
  }, []);

  return {
    start,
    cancel,
    end,
    wasTriggered,
    resetTriggered,
  };
}
