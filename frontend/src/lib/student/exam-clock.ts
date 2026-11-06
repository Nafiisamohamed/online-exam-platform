/**
 * Exam timing on the student's screen.
 *
 * The server owns the deadline. Every attempt response and heartbeat carries
 * `remainingSeconds`; the screen counts down from the latest of those values
 * using a monotonic clock (performance.now), which the device's date and
 * time settings cannot change. Each heartbeat (every few seconds) replaces
 * the sync point, so extensions and drift show up at once. Saving after the
 * deadline is refused by the server whatever the screen shows.
 */

export interface SyncPoint {
  /** Seconds left according to the server. */
  remaining: number;
  /** performance.now() when that value arrived. */
  at: number;
}

export function syncPoint(remainingSeconds: number, at: number): SyncPoint {
  return { remaining: Math.max(0, remainingSeconds), at };
}

/** Seconds left now, counted down from the last server value. */
export function remainingAt(sync: SyncPoint, now: number): number {
  return Math.max(0, Math.ceil(sync.remaining - (now - sync.at) / 1000));
}

/** "1:05:09", "12:04" or "0:42". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Display level of the timer, following the server's own warning points (10 minutes, 1 minute). */
export function timerLevel(seconds: number): "normal" | "ten" | "one" {
  return seconds <= 60 ? "one" : seconds <= 600 ? "ten" : "normal";
}

/**
 * A random UUID for retry-safe focus events. crypto.randomUUID only exists on
 * secure (https or localhost) pages; the campus network may serve plain http,
 * so the same v4 format is built from crypto.getRandomValues there.
 */
export function newUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** "in 2 h 05 min", "in 4 min 09 s": time until a moment, using the server clock offset (display only). */
export function untilParts(targetIso: string, serverNow: number) {
  const s = Math.max(0, Math.round((new Date(targetIso).getTime() - serverNow) / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, total: s };
}
