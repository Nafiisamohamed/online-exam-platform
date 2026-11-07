"use client";

/**
 * Live monitoring data: polls GET /api/invigilation/sessions/:id/live every
 * `refreshSeconds` (the server's own value, 5 s). The server decides every
 * status (including DISCONNECTED after 30 s without contact); between polls
 * the screen only counts the time-left and last-contact figures forward with
 * a monotonic clock so they stay readable. A failed poll keeps the last data
 * on screen, marks it stale and retries; an ended session (404) is reported.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { loadLive } from "@/lib/api/invigilator";
import type { LiveView } from "@/types/invigilator";

export interface LiveState {
  data: LiveView | null;
  error: ApiError | null;
  /** Seconds since the last successful poll (0 until the first one). */
  sinceUpdate: number;
  /** True when polls are failing and the data on screen is old. */
  stale: boolean;
  refresh: () => void;
}

export function useLive(sessionId: string): LiveState {
  const [data, setData] = useState<LiveView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [sinceUpdate, setSinceUpdate] = useState(0);
  const fetchedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef(true);
  const intervalMs = useRef(5000);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const next = await loadLive<LiveView>(sessionId);
      if (!live.current) return;
      intervalMs.current = Math.max(2, next.refreshSeconds) * 1000;
      fetchedAt.current = performance.now();
      setData(next);
      setError(null);
    } catch (err) {
      if (!live.current) return;
      setError(err instanceof ApiError ? err : new ApiError(0, "NETWORK_ERROR", ""));
    }
    if (live.current) timer.current = setTimeout(() => void pollRef.current(), intervalMs.current);
  }, [sessionId]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    live.current = true;
    timer.current = setTimeout(() => void pollRef.current(), 0); // first poll right away
    // Polling continues in a background tab (monitoring must not go quiet); coming back refreshes at once.
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => fetchedAt.current !== null && setSinceUpdate(Math.floor((performance.now() - fetchedAt.current) / 1000)), 1000);
    return () => {
      live.current = false;
      clearTimeout(timer.current);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  const stale = !!error && data !== null && sinceUpdate > (data?.refreshSeconds ?? 5) * 2;
  return { data, error, sinceUpdate, stale, refresh: () => void poll() };
}
