/**
 * Dates and numbers for display. Times come from the API in UTC and are shown
 * in the campus time zone (the backend's APP_TIMEZONE default), so everyone
 * sees the same exam times wherever their device clock is set.
 */
export const CAMPUS_TIME_ZONE = "Africa/Mogadishu";

const tag = (locale: string) => (locale === "so" ? "so-SO" : "en-GB");

export function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(tag(locale), { day: "2-digit", month: "short", year: "numeric", timeZone: CAMPUS_TIME_ZONE }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(tag(locale), {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: CAMPUS_TIME_ZONE,
  }).format(new Date(iso));
}

/** "09:00–11:00" on the window's start date. */
export function formatTimeRange(startIso: string, endIso: string, locale: string) {
  const time = new Intl.DateTimeFormat(tag(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: CAMPUS_TIME_ZONE });
  return `${time.format(new Date(startIso))}–${time.format(new Date(endIso))}`;
}

export function formatNumber(n: number | null | undefined, locale: string, digits = 0) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

/** "62.5%"; null (no data) is shown as a dash, never as 0. */
export function formatPercent(n: number | null | undefined, locale: string, digits = 1) {
  return n === null || n === undefined ? "—" : `${formatNumber(n, locale, digits)}%`;
}

/** Share of `part` in `whole` as a percentage, or null when `whole` is 0. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** "5 minutes ago", "yesterday"… relative to `now` (pass the value of useNow()). */
export function formatRelative(iso: string, now: number, locale: string) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale === "so" ? "so" : "en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  if (Math.abs(minutes) < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour");
  return rtf.format(-Math.round(minutes / 1440), "day");
}
