/**
 * Minimal structured logger (one JSON line per event).
 *
 * Request bodies are never logged, so passwords and demo PINs cannot end up in
 * log files. Silent during automated tests unless LOG_IN_TESTS=1.
 */
const silent = process.env.NODE_ENV === "test" && process.env.LOG_IN_TESTS !== "1";

function write(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) {
  if (silent) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  (level === "error" ? console.error : console.log)(line);
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
