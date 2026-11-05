"use client";

/**
 * Sign-in (POST /api/auth/login) and, for temporary passwords, the required
 * password change (POST /api/auth/change-password). The API sets an HTTP-only
 * session cookie; this page never stores the password or the session itself.
 */
import { ArrowLeft, Eye, EyeOff, GraduationCap, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { LanguageSwitch, ThemeMenu } from "@/components/layout/header-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import type { Profile } from "@/types/account";

/** Same rule as the API (auth.routes): at least 8 characters, with a letter and a digit. */
const passwordOk = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

function PasswordInput({ id, describedBy, invalid, value, onChange, autoComplete }: { id: string; describedBy?: string; invalid: boolean; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className="pr-11" required />
      <button type="button" onClick={() => setShown((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-subtle hover:text-foreground" aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}>
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
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

function ChangePasswordForm({ onChanged }: { onChanged: (user: Profile) => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const ruleError = touched && !passwordOk(next) ? t("auth.passwordRule") : undefined;
  const repeatError = touched && repeat !== next ? t("auth.mismatch") : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!passwordOk(next) || repeat !== next) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: Profile }>("/auth/change-password", { method: "POST", json: { currentPassword: current, newPassword: next } });
      onChanged(user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Alert tone="warning">{t("auth.changeHint")}</Alert>
      <FormError error={error} />
      <Field label={t("auth.currentPassword")} required>
        {(ids) => <PasswordInput {...ids} value={current} onChange={setCurrent} autoComplete="current-password" />}
      </Field>
      <Field label={t("auth.newPassword")} hint={t("auth.passwordRule")} error={ruleError} required>
        {(ids) => <PasswordInput {...ids} value={next} onChange={setNext} autoComplete="new-password" />}
      </Field>
      <Field label={t("auth.confirmPassword")} error={repeatError} required>
        {(ids) => <PasswordInput {...ids} value={repeat} onChange={setRepeat} autoComplete="new-password" />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!current || !next || !repeat}>
        {t("auth.savePassword")}
      </Button>
    </form>
  );
}

export default function SignInPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { isLoading, isPreview, profile, signedIn } = useSession();
  const mustChange = !isPreview && profile.mustChangePassword;

  // Already signed in with a normal password: nothing to do here.
  useEffect(() => {
    if (!isLoading && !isPreview && !profile.mustChangePassword) router.replace("/dashboard");
  }, [isLoading, isPreview, profile.mustChangePassword, router]);

  const done = (user: Profile) => {
    signedIn(user);
    if (!user.mustChangePassword) router.replace("/dashboard");
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
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> {t("auth.backToApp")}
          </Link>
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
              {isLoading ? null : mustChange ? <ChangePasswordForm onChanged={done} /> : <SignInForm onSignedIn={done} />}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
