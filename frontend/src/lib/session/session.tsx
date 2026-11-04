"use client";

/**
 * The signed-in user, shared by the whole shell.
 *
 * On load it asks the API for the current user (GET /api/auth/me). When nobody
 * is signed in (sign-in arrives in a later phase), the shell runs in preview
 * mode: it shows a seeded demo account, and the role can be switched to review
 * each role's navigation. Components only read `profile` and `role`, so
 * switching to real sign-in later changes nothing in the layout.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
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
  /** Preview mode only: show the shell as another role. */
  setPreviewRole: (role: Role) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const previewRoleStore = createPersistedStore<Role>(STORAGE_KEYS.previewRole, "LECTURER", ROLES);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const previewRole = usePersisted(previewRoleStore);

  useEffect(() => {
    let cancelled = false;
    api<{ user: Profile }>("/auth/me")
      .then(({ user }) => !cancelled && setState({ status: "signed-in", profile: user }))
      .catch(() => {
        // Not signed in (401) or the API is unreachable: show the preview account.
        if (!cancelled) setState({ status: "preview" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setState({ status: "preview" });
  }, []);

  const value = useMemo<SessionValue>(() => {
    const profile = state.status === "signed-in" ? state.profile : PREVIEW_ACCOUNTS[previewRole];
    return {
      profile,
      role: profile.role,
      isPreview: state.status !== "signed-in",
      isLoading: state.status === "loading",
      setPreviewRole: previewRoleStore.set,
      signOut,
    };
  }, [state, previewRole, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
