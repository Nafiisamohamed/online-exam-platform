"use client";

/**
 * Light / dark / system theme.
 *
 * The choice is saved in localStorage. BOOT_SCRIPT (lib/boot-script.ts) runs in <head> before the
 * first paint and sets the `dark` class on <html>, so the page never flashes
 * the wrong theme. Components read the choice with useTheme(); all colours
 * come from CSS variables, so nothing else needs to re-render on a switch.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createPersistedStore, usePersisted } from "./persisted-store";
import { STORAGE_KEYS } from "./storage";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const themeStore = createPersistedStore<ThemeChoice>(STORAGE_KEYS.theme, "system", ["light", "dark", "system"]);

const DARK_QUERY = "(prefers-color-scheme: dark)";
const subscribeSystem = (listener: () => void) => {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const systemIsDark = () => window.matchMedia(DARK_QUERY).matches;

/**
 * Keeps the `dark` class on <html> in line with later changes (a new choice,
 * or the OS theme changing while "system" is chosen). The first paint is
 * handled by BOOT_SCRIPT, so nothing is applied on mount.
 */
export function ThemeSync() {
  useEffect(() => {
    const apply = () => {
      const c = themeStore.get();
      document.documentElement.classList.toggle("dark", c === "dark" || (c === "system" && systemIsDark()));
    };
    const offStore = themeStore.subscribe(apply);
    const offSystem = subscribeSystem(apply);
    return () => {
      offStore();
      offSystem();
    };
  }, []);
  return null;
}

export function useTheme() {
  const choice = usePersisted(themeStore);
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false);
  const resolved: ResolvedTheme = choice === "system" ? (systemDark ? "dark" : "light") : choice;
  const setChoice = useCallback((next: ThemeChoice) => themeStore.set(next), []);
  const toggle = useCallback(() => themeStore.set(resolved === "dark" ? "light" : "dark"), [resolved]);
  return { choice, resolved, setChoice, toggle };
}
