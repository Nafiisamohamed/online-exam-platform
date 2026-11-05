"use client";

/**
 * The signed-in user, shared by the whole shell.
 *
 * On load it asks the API for the current user (GET /api/auth/me). The sign-in
 * page reports a successful login with signedIn(user).
 *
 * When nobody is signed in, the shell runs in preview mode: it shows a seeded
 * demo account so each role's navigation can be reviewed. Preview mode never
 * shows live data: admin pages ask the user to sign in instead.
 *
 * If the API answers 401 (session expired, account deactivated, password
 * reset), the client fires SESSION_ENDED_EVENT and the shell returns to the
 * signed-out state. Cached API data is cleared whenever the user changes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, SESSION_ENDED_EVENT } from "@/lib/api/client";
import { clearApiCache } from "@/lib/api/use-api";
import { createPersistedStore, usePersisted } from "@/lib/persisted-store";
import { PREVIEW_ACCOUNTS } from "@/lib/preview/demo-accounts";
import { STORAGE_KEYS } from "@/lib/storage";
import { ROLES, type Profile, type Role } from "@/types/account";

type SessionState = { status: "loading" } | { status: "signed-in"; profile: Profile } | { status: "preview" };

interface SessionValue {
  profile: Profile;
  role: Role;
  isPreview: boolean;
  isLoading: boolean;
  /** True after the server said the session ended (shown on the sign-in page). */
  sessionEnded: boolean;
  /** Called by the sign-in and change-password forms with the user from the API. */
  signedIn: (user: Profile) => void;
  /** Preview mode only: show the shell as another role. */
  setPreviewRole: (role: Role) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const previewRoleStore = createPersistedStore<Role>(STORAGE_KEYS.previewRole, "LECTURER", ROLES);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [sessionEnded, setSessionEnded] = useState(false);
  const signedInRef = useRef(false);
  useEffect(() => {
    signedInRef.current = state.status === "signed-in";
  }, [state]);
  const previewRole = usePersisted(previewRoleStore);

  useEffect(() => {
    let cancelled = false;
    api<{ user: Profile }>("/auth/me")
      .then(({ user }) => !cancelled && setState({ status: "signed-in", profile: user }))
      .catch(() => {
        // Not signed in (401) or the API is unreachable: show the preview account.
        if (!cancelled) setState({ status: "preview" });
      });
    const onEnded = () => {
      clearApiCache();
      if (signedInRef.current) setSessionEnded(true);
      setState({ status: "preview" });
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
    };
  }, []);

  const signedIn = useCallback((user: Profile) => {
    clearApiCache();
    setSessionEnded(false);
    setState({ status: "signed-in", profile: user });
  }, []);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearApiCache();
    setState({ status: "preview" });
  }, []);

  const value = useMemo<SessionValue>(() => {
    const profile = state.status === "signed-in" ? state.profile : PREVIEW_ACCOUNTS[previewRole];
    return {
      profile,
      role: profile.role,
      isPreview: state.status !== "signed-in",
      isLoading: state.status === "loading",
      sessionEnded,
      signedIn,
      setPreviewRole: previewRoleStore.set,
      signOut,
    };
  }, [state, previewRole, signOut, signedIn, sessionEnded]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
