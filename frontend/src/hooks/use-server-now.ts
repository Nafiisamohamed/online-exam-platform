"use client";

/**
 * The server's current time, for countdowns to an exam window (display only:
 * the server decides whether an exam can start). The offset between the
 * device clock and the server comes from GET /api/health once; then a
 * monotonic clock moves it on, so a wrong device clock does not matter.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

let base: { server: number; perf: number } | null = null;
let loading: Promise<void> | null = null;

function loadOffset() {
  loading ??= api<{ serverTime: string }>("/health")
    .then((h) => {
      base = { server: new Date(h.serverTime).getTime(), perf: performance.now() };
    })
    .catch(() => {
      loading = null; // try again next time
    });
  return loading;
}

/** Server time in ms, updated every second; null until the server time is known. */
export function useServerNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const update = () => base && live && setNow(base.server + (performance.now() - base.perf));
    void loadOffset().then(update);
    const id = setInterval(update, 1000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  return now;
}
