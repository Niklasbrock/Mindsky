import { useRef } from 'react';

/**
 * Hook that keeps a ref always up-to-date with the latest value.
 * Eliminates stale closure issues without needing useEffect + dependency arrays.
 *
 * Usage:
 *   const callbacksRef = useLatest({ onClick, onHover });
 *   // callbacksRef.current is always the latest value
 */
export function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  // Synchronously update on every render - always current
  ref.current = value;
  return ref;
}
