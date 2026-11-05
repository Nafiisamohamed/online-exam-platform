/**
 * Calls to the Express API.
 *
 * In development and on the campus server, Next.js forwards /api/* to the API
 * (see next.config.ts), so the browser talks to one origin and the HTTP-only
 * session cookie (SameSite=Strict) is sent automatically.
 *
 * Errors keep the API's stable code (e.g. "ATTEMPT_DEADLINE_PASSED"); screens
 * translate the code instead of showing the English message.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

/** Fired when the API says the session is missing or has ended, so the shell can sign the user out. */
export const SESSION_ENDED_EVENT = "oe:session-ended";

/** Absolute path of an API endpoint, for downloads opened by the browser itself (CSV templates, exports). */
export function apiUrl(path: string) {
  return `/api${path}`;
}

/** Builds "?a=1&b=2" from the defined, non-empty values. */
export function query(params: Record<string, string | number | boolean | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "include",
      ...rest,
      headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "The server could not be reached");
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as ErrorBody & T;
  if (!res.ok) {
    const code = body.error?.code;
    if (res.status === 401 && (code === "UNAUTHENTICATED" || code === "SESSION_EXPIRED") && typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    }
    throw new ApiError(res.status, body.error?.code ?? "HTTP_" + res.status, body.error?.message ?? res.statusText, body.error?.details);
  }
  return body;
}
