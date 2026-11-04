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
    throw new ApiError(res.status, body.error?.code ?? "HTTP_" + res.status, body.error?.message ?? res.statusText, body.error?.details);
  }
  return body;
}
