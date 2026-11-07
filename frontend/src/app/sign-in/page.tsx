"use client";

/**
 * Sign-in (POST /api/auth/login) and, for temporary passwords, the required
 * password change (POST /api/auth/change-password). The API sets an HTTP-only
 * session cookie; this page never stores the password or the session itself.
 */
import { GraduationCap, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { LanguageSwitch, ThemeMenu } from "@/components/layout/header-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChangePasswordForm, PasswordInput } from "@/components/auth/password-forms";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import type { Profile, Role } from "@/types/account";

/** Where each role lands after signing in: /dashboard shows that role's own overview. */
const ROLE_PREFIX: Record<Role, string> = { ADMIN: "/admin", LECTURER: "/lecturer", STUDENT: "/student", INVIGILATOR: "/invigilator" };

/**
 * The page the visitor wanted before being sent here (?next=), only if it is a
 * local path this role may use; anything else goes to the role dashboard.
 */
function landingFor(role: Role): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  const local = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
  const prefix = ROLE_PREFIX[role];
  const ok = local && (next === "/profile" || next === prefix || next.startsWith(`${prefix}/`) || (role === "STUDENT" && next.startsWith("/exam/")));
  return ok ? next : "/dashboard";
}

function SignInForm({ onSignedIn }: { onSignedIn: (user: Profile) => void }) {
  const { t } = useI18n();
  const { sessionEnded } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: Profile }>("/auth/login", { method: "POST", json: { identifier: identifier.trim(), password } });
      setPassword("");
      onSignedIn(user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {sessionEnded && !error && <Alert tone="info">{t("auth.sessionEnded")}</Alert>}
      <FormError error={error} />
      <Field label={t("auth.identifier")} required>
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus required />}
      </Field>
      <Field label={t("auth.password")} required>
        {(ids) => <PasswordInput {...ids} value={password} onChange={setPassword} autoComplete="current-password" />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!identifier.trim() || !password}>
        {t("auth.submit")}
      </Button>
    </form>
  );
}

export default function SignInPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { isLoading, isSignedIn, profile, signedIn } = useSession();
  const mustChange = isSignedIn && profile.mustChangePassword;

  // Already signed in with a normal password: go to the role's own pages.
  useEffect(() => {
    if (!isLoading && isSignedIn && !profile.mustChangePassword) router.replace(landingFor(profile.role));
  }, [isLoading, isSignedIn, profile.mustChangePassword, profile.role, router]);

  const done = (user: Profile) => {
    signedIn(user);
    if (!user.mustChangePassword) router.replace(landingFor(user.role));
  };

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(150deg,var(--navy-950),var(--navy-900)_45%,var(--navy-700))] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--sky-500),var(--sky-700))] shadow-raised">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-bold">{t("app.shortName")}</span>
            <span className="block text-sm text-white/65">{t("app.university")}</span>
          </span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-bold tracking-tight">{t("app.name")}</h2>
          <p className="mt-3 text-base text-white/75">{t("app.tagline")}</p>
          <p className="mt-8 flex items-center gap-2 text-sm text-white/65">
            <ShieldCheck className="h-4 w-4 text-sky" aria-hidden /> {t("auth.campusNote")}
          </p>
        </div>
        <span aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-sky/20 blur-3xl" />
      </aside>

      <main className="flex flex-col bg-[linear-gradient(180deg,var(--background-cream)_0%,var(--background)_480px)]">
        <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-8">
          <span className="text-sm font-semibold text-foreground lg:invisible">{t("app.shortName")}</span>
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitch />
            <ThemeMenu />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-8">
          <Card className="w-full max-w-md p-6 sm:p-8">
            <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
              <LockKeyhole className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{mustChange ? t("auth.changeTitle") : t("auth.signInTitle")}</h1>
            {!mustChange && <p className="mt-1.5 mb-6 text-sm text-muted">{t("auth.signInSubtitle")}</p>}
            <div className={mustChange ? "mt-6" : undefined}>
              {isLoading ? null : mustChange ? <ChangePasswordForm forced onChanged={done} /> : <SignInForm onSignedIn={done} />}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
