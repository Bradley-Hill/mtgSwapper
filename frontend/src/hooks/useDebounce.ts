import { useEffect, useState } from 'react';

/**
 * useDebounce — delays updating the returned value until the input hasn't changed
 * for `delayMs` milliseconds.
 *
 * Why this pattern?
 * Calling an API on every keystroke is wasteful and can cause race conditions
 * (earlier slow requests resolving after faster ones). By delaying until the
 * user pauses typing, we dramatically reduce API calls while keeping the UI
 * feeling responsive.
 *
 * The cleanup function (`clearTimeout`) is critical: without it, if the component
 * unmounts mid-debounce, the timeout fires and tries to call `setState` on an
 * unmounted component — causing a React warning.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
