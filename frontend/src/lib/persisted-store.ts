"use client";

/**
 * A small value saved in localStorage that React components can subscribe to
 * with useSyncExternalStore. The server (and the first client render during
 * hydration) always uses the default, so server and client markup match; the
 * saved value is applied right after. Changes in other tabs are picked up too.
 */
import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./storage";

export interface PersistedStore<T extends string> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
  defaultValue: T;
}

export function createPersistedStore<T extends string>(key: string, defaultValue: T, allowed: readonly T[]): PersistedStore<T> {
  const listeners = new Set<() => void>();
  const read = (): T => {
    const saved = readStorage(key);
    return saved !== null && (allowed as readonly string[]).includes(saved) ? (saved as T) : defaultValue;
  };
  return {
    defaultValue,
    get: read,
    set(value) {
      writeStorage(key, value);
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => e.key === key && listener();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

export function usePersisted<T extends string>(store: PersistedStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.defaultValue);
}
