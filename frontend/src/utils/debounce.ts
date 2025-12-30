/**
 * Creates a debounced version of a function that delays execution
 * until after the specified wait time has elapsed since the last call.
 *
 * @param fn - The function to debounce
 * @param wait - The delay in milliseconds
 * @returns A debounced version of the function with a cancel method
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  wait: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, wait);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}
