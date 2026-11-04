/**
 * Safe localStorage access: private windows or blocked storage must never
 * break the page, so every read and write is wrapped.
 */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice simply is not remembered */
  }
}

export const STORAGE_KEYS = {
  theme: "oe-theme",
  locale: "oe-locale",
  sidebarCollapsed: "oe-sidebar-collapsed",
  previewRole: "oe-preview-role",
} as const;
