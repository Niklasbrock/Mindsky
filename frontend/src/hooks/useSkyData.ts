import { useState, useEffect, useCallback, useRef } from 'react';
import type { SkyData } from '../types';
import { getSky } from '../services/api';

export function useSkyData() {
  const [data, setData] = useState<SkyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    // Cancel any in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      const skyData = await getSky(abortControllerRef.current.signal);
      setData(skyData);
      setError(null);
    } catch (err) {
      // Don't set error state for aborted requests
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load sky data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Cleanup: abort any pending request when component unmounts
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
