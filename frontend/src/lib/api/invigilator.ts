/**
 * Invigilator endpoints (docs/api.md "Invigilation"). The backend only lets an
 * assigned invigilator see a session; anything else answers 404.
 */
import type { ExtensionResult, InvigilatorNote } from "@/types/invigilator";
import { api } from "./client";
import { invalidate } from "./use-api";

export const invigilatorPaths = {
  sessions: "/invigilation/sessions",
  live: (id: string) => `/invigilation/sessions/${id}/live`,
  notes: (id: string) => `/invigilation/sessions/${id}/notes`,
  focusEvents: (attemptId: string) => `/invigilation/attempts/${attemptId}/focus-events`,
  notifications: "/notifications",
} as const;

/** The live list is polled by the screen itself (every refreshSeconds), not cached. */
export function loadLive<T>(sessionId: string) {
  return api<T>(invigilatorPaths.live(sessionId));
}

export async function addNote(sessionId: string, text: string, studentId?: string) {
  const res = await api<{ note: InvigilatorNote }>(`/invigilation/sessions/${sessionId}/notes`, { method: "POST", json: { text, ...(studentId ? { studentId } : {}) } });
  invalidate(invigilatorPaths.notes(sessionId));
  return res.note;
}

/** 1-15 minutes with a reason, at most 15 minutes in total per attempt (checked again by the server). */
export function grantExtension(attemptId: string, minutes: number, reason: string) {
  return api<ExtensionResult>(`/invigilation/attempts/${attemptId}/extensions`, { method: "POST", json: { minutes, reason } });
}
