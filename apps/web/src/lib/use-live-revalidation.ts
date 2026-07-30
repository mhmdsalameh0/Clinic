"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createLiveRevalidator } from "./live-refresh";

type Options<T> = {
  load: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError?: (error: unknown) => void;
  intervalMs?: number;
  deps?: React.DependencyList;
};

export function useLiveRevalidation<T>({ load, onData, onError, intervalMs = 2000, deps = [] }: Options<T>) {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const loadRef = useRef(load);
  const onDataRef = useRef(onData);
  const onErrorRef = useRef(onError);

  loadRef.current = load;
  onDataRef.current = onData;
  onErrorRef.current = onError;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await loadRef.current(signal ?? new AbortController().signal);
      onDataRef.current(data);
      hasLoadedRef.current = true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        onErrorRef.current?.(error);
      }
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsInitialLoading(!hasLoadedRef.current);
    const revalidator = createLiveRevalidator({
      intervalMs,
      refresh: async (signal) => {
        await refresh(signal);
      }
    });
    revalidator.start();
    return () => revalidator.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { isInitialLoading, revalidate: refresh };
}
