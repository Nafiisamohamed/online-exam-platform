"use client";

/**
 * The signed-in user, shared by the whole shell.
 *
 * On load it asks the API for the current user (GET /api/auth/me): the session
 * lives in an HTTP-only cookie the browser sends by itself, so a page refresh
 * keeps the user signed in and nothing secret is ever stored by this code.
 * The sign-in and change-password forms report their result with signedIn(user).
 *
 * Without a session the status is "signed-out" and the shell sends the visitor
 * to the sign-in page. If the API answers 401 later (session expired, account
 * deactivated, password reset), the client fires SESSION_ENDED_EVENT and the
 * shell returns to the signed-out state with an explanation. So that this also
 * happens on a page that is only being looked at, the session is re-checked
 * every SESSION_CHECK_MS and whenever the tab or window comes back into view.
 * Cached API data is cleared whenever the user changes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, SESSION_ENDED_EVENT } from "@/lib/api/client";
import { clearApiCache } from "@/lib/api/use-api";
import type { Profile } from "@/types/account";

type SessionState = { status: "loading" } | { status: "signed-in"; profile: Profile } | { status: "signed-out" };

interface SessionValue {
  /** The signed-in user. Only meaningful when isSignedIn; pages are not shown otherwise. */
  profile: Profile;
  role: Profile["role"];
  isSignedIn: boolean;
  isLoading: boolean;
  /** True after the server said the session ended (shown on the sign-in page). */
  sessionEnded: boolean;
  /** Called by the sign-in and change-password forms with the user from the API. */
  signedIn: (user: Profile) => void;
  /** Ends the server session cookie, then clears everything cached for the user. */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** How often an idle signed-in page asks the server whether the session is still valid. */
export const SESSION_CHECK_MS = 30_000;

/** Placeholder so consumers always get a Profile; never displayed while signed out. */
const NO_PROFILE: Profile = { id: "", role: "STUDENT", fullName: "", email: null, studentNumber: null, phone: "", preferredLanguage: "so", mustChangePassword: false };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [sessionEnded, setSessionEnded] = useState(false);
  const signedInRef = useRef(false);
  useEffect(() => {
    signedInRef.current = state.status === "signed-in";
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    api<{ user: Profile }>("/auth/me")
      .then(({ user }) => !cancelled && setState({ status: "signed-in", profile: user }))
      .catch(() => !cancelled && setState({ status: "signed-out" }));
    const onEnded = () => {
      clearApiCache();
      if (signedInRef.current) setSessionEnded(true);
      setState({ status: "signed-out" });
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
    };
  }, []);

  // Re-check the session while signed in: a 401 fires SESSION_ENDED_EVENT (handled above);
  // network errors are ignored here, the pages report those themselves.
  const signedInNow = state.status === "signed-in";
  useEffect(() => {
    if (!signedInNow) return;
    let last = Date.now(); // the session was just confirmed by the sign-in or GET /auth/me
    const recheck = () => {
      if (Date.now() - last < 5_000) return; // focus and visibility events often come in pairs
      last = Date.now();
      void api("/auth/me").catch(() => undefined);
    };
    const onVisible = () => document.visibilityState === "visible" && recheck();
    const timer = setInterval(recheck, SESSION_CHECK_MS);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedInNow]);

  const signedIn = useCallback((user: Profile) => {
    clearApiCache();
    setSessionEnded(false);
    setState({ status: "signed-in", profile: user });
  }, []);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearApiCache();
    setSessionEnded(false);
    setState({ status: "signed-out" });
  }, []);

  const value = useMemo<SessionValue>(() => {
    const profile = state.status === "signed-in" ? state.profile : NO_PROFILE;
    return { profile, role: profile.role, isSignedIn: state.status === "signed-in", isLoading: state.status === "loading", sessionEnded, signedIn, signOut };
  }, [state, sessionEnded, signOut, signedIn]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
