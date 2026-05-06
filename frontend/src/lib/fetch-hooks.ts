/**
 * React hooks for mobile-friendly data fetching with timeout support
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchWithTimeout, FetchOptions, TimeoutError } from "./fetch-with-timeout";

export interface UseFetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isTimeout: boolean;
}

/**
 * Hook for fetching data with timeout and error handling
 * Mobile-optimized: aborts slow requests and retries on timeout
 */
export function useFetch<T = any>(
  url: string | null,
  options: FetchOptions & { deps?: any[] } = {}
): UseFetchState<T> {
  const { deps = [] } = options;
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    loading: !!url,
    error: null,
    isTimeout: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null, isTimeout: false });
      return;
    }

    let isMounted = true;
    abortControllerRef.current = new AbortController();

    setState((prev) => ({ ...prev, loading: true, error: null, isTimeout: false }));

    fetchWithTimeout(url, {
      timeout: 10000,
      retries: 1,
      ...options,
      signal: abortControllerRef.current.signal,
    })
      .then(async (response) => {
        if (!isMounted) return;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (isMounted) {
          setState({ data, loading: false, error: null, isTimeout: false });
        }
      })
      .catch((error) => {
        if (!isMounted) return;

        const isTimeout = error instanceof TimeoutError || error.name === "AbortError";
        setState({
          data: null,
          loading: false,
          error: isTimeout ? new Error("Request timeout - network may be slow") : error,
          isTimeout,
        });
      });

    return () => {
      isMounted = false;
      abortControllerRef.current?.abort();
    };
  }, [url, ...deps]);

  return state;
}

/**
 * Hook for one-time data fetch on component mount
 * Returns a function to manually trigger the fetch
 */
export function useLazyFetch<T = any>(
  defaultUrl?: string
): [
  (url?: string) => Promise<T>,
  UseFetchState<T> & { retry: () => void }
] {
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    loading: false,
    error: null,
    isTimeout: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUrlRef = useRef<string | undefined>(defaultUrl);

  const fetch = useCallback(async (url?: string): Promise<T> => {
    const fetchUrl = url || lastUrlRef.current;
    if (!fetchUrl) {
      throw new Error("No URL provided");
    }

    lastUrlRef.current = fetchUrl;

    // Abort previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState({ data: null, loading: true, error: null, isTimeout: false });

    try {
      const response = await fetchWithTimeout(fetchUrl, {
        timeout: 10000,
        retries: 1,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setState({ data, loading: false, error: null, isTimeout: false });
      return data;
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error(String(error));
      const isTimeout = error instanceof TimeoutError || err.name === "AbortError";

      setState({
        data: null,
        loading: false,
        error: isTimeout ? new Error("Request timeout - network may be slow") : err,
        isTimeout,
      });

      throw err;
    }
  }, []);

  const retry = useCallback(() => {
    return fetch(lastUrlRef.current);
  }, [fetch]);

  return [fetch, { ...state, retry }];
}
