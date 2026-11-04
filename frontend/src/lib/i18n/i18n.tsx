"use client";

/**
 * Somali / English interface text.
 *
 * - Somali ("so") is the platform default; the choice is saved in
 *   localStorage. After sign-in (later phase) it will follow the user's
 *   saved preference from the API (PATCH /api/auth/language).
 * - useI18n().t("profile.title") returns the text in the current language;
 *   "{name}" placeholders are filled from the second argument.
 * - Keys are type-checked: a missing or misspelt key is a compile error.
 */
import { useCallback, useEffect, useMemo } from "react";
import { createPersistedStore, usePersisted } from "../persisted-store";
import { STORAGE_KEYS } from "../storage";
import { en, type Messages } from "./messages/en";
import { so } from "./messages/so";

export type Locale = "so" | "en";
export const LOCALES: readonly Locale[] = ["so", "en"];
export const DEFAULT_LOCALE: Locale = "so";
export const dictionaries: Record<Locale, Messages> = { so, en };

/** Dotted paths to every text in the message tree, e.g. "nav.dashboard". */
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;

const localeStore = createPersistedStore<Locale>(STORAGE_KEYS.locale, DEFAULT_LOCALE, LOCALES);

/** Looks up a dotted key and fills {placeholders}. Falls back to the key itself. */
export function translate(dict: Messages, key: MessageKey, vars?: Record<string, string | number>): string {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
  if (typeof value !== "string") return key;
  return vars ? value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : value;
}

export function useI18n() {
  const locale = usePersisted(localeStore);
  const dict = dictionaries[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(dict, key, vars), [dict]);
  const setLocale = useCallback((next: Locale) => localeStore.set(next), []);
  return useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
}
