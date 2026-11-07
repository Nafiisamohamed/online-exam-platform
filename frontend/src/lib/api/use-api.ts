"use client";

/**
 * Reading API data in components.
 *
 * useApi("/faculties") loads a GET endpoint and returns { data, error, loading, reload }.
 * - Responses are kept in a small in-memory cache for the browser tab, and
 *   identical requests made at the same time share one call, so pages that
 *   need the same list (e.g. faculties) don't ask the server twice.
 * - After a change (create, edit, enrol…) call invalidate("/courses"): every
 *   cached path starting with that prefix is fetched again when a screen
 *   next shows it (the old data stays visible meanwhile).
 * - Pass null as the path to skip loading (e.g. until a course is chosen).
 * - { keepPrevious: true } keeps showing the last page of a list while the
 *   next page or filter result loads, instead of flashing a skeleton.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, ApiError } from "./client";

interface Entry {
  data?: unknown;
  error?: ApiError;
  promise?: Promise<void>;
  /** Set by invalidate: the data stays on screen but is fetched again by the next reader. */
  stale?: boolean;
  /** Bumped on invalidate, so a slow old response can't overwrite a newer one. */
  version: number;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function entry(path: string): Entry {
  let e = cache.get(path);
  if (!e) cache.set(path, (e = { version: 0 }));
  return e;
}

function load(path: string) {
  const e = entry(path);
  if (e.promise) return e.promise;
  const version = e.version;
  e.promise = api<unknown>(path)
    .then((data) => {
      if (entry(path).version !== version) return;
      cache.set(path, { data, version });
    })
    .catch((error: unknown) => {
      if (entry(path).version !== version) return;
      const err = error instanceof ApiError ? error : new ApiError(0, "NETWORK_ERROR", String(error));
      cache.set(path, { error: err, version });
    })
    .finally(notify);
  notify();
  return e.promise;
}

/**
 * The same cached GET for code that needs a promise (several paths at once):
 * screens reading the same path with useApi() share this one request.
 */
export async function fetchCached<T>(path: string): Promise<T> {
  const e = cache.get(path);
  if (!e || e.stale || (e.data === undefined && !e.error)) await load(path);
  const done = cache.get(path);
  if (done?.error) throw done.error;
  return done?.data as T;
}

/** Refetches every cached GET whose path starts with one of the prefixes. */
export function invalidate(...prefixes: string[]) {
  for (const [path, e] of cache) {
    if (!prefixes.some((p) => path.startsWith(p))) continue;
    cache.set(path, { data: e.data, version: e.version + 1, stale: true });
  }
  notify();
}

/** Forgets every cached response (on sign-in and sign-out, so one user never sees another's data). */
export function clearApiCache() {
  cache.clear();
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  /** True while the response for this path is on its way. */
  loading: boolean;
  reload: () => void;
}

export function useApi<T>(path: string | null, options: { keepPrevious?: boolean } = {}): ApiState<T> {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (path ? cache.get(path) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (!path) return;
    const e = cache.get(path);
    if (!e || (!e.promise && (e.stale || (e.data === undefined && !e.error)))) void load(path);
  }, [path, snapshot]);

  const reload = useCallback(() => {
    if (path) invalidate(path);
  }, [path]);

  const fresh = snapshot?.data as T | undefined;
  const error = snapshot?.error;
  // Remember the last data shown (React's "adjust state while rendering" pattern).
  const [previous, setPrevious] = useState<T | undefined>(fresh);
  if (fresh !== undefined && fresh !== previous) setPrevious(fresh);
  const loading = !!path && fresh === undefined && !error;
  const data = fresh ?? (options.keepPrevious && loading ? previous : undefined);
  return { data, error, loading, reload };
}
