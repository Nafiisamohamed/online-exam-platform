"use client";

/**
 * Sign-in (POST /api/auth/login) and, for temporary passwords, the required
 * password change (POST /api/auth/change-password). The API sets an HTTP-only
 * session cookie; this page never stores the password or the session itself.
 *
 * Layout: on large screens a photograph of students with the ExamHub branding on the
 * left and the form on the right; on smaller screens a short photo banner above
 * the form. Only the presentation lives here; the sign-in logic is unchanged.
 */
import { KeyRound, Languages, LogIn, Network, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { BrandLogo, BrandName } from "@/components/layout/brand-logo";
import { LanguageSwitch, ThemeMenu } from "@/components/layout/header-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BRAND_ACTION, ChangePasswordForm, PasswordInput } from "@/components/auth/password-forms";
import { cn } from "@/lib/cn";
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

/** Sign-in fields: taller, with room for the icon on the left. */
const FIELD = "h-12 rounded-xl pl-11 text-[15px]";

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
    <form onSubmit={submit} className="space-y-6" noValidate>
      {sessionEnded && !error && <Alert tone="info">{t("auth.sessionEnded")}</Alert>}
      <FormError error={error} />
      <Field label={t("auth.identifier")} required>
        {({ id, describedBy }) => (
          <div className="relative">
            <UserRound aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-subtle" />
            <Input id={id} aria-describedby={describedBy} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus required className={FIELD} />
          </div>
        )}
      </Field>
      <Field label={t("auth.password")} required>
        {(ids) => <PasswordInput {...ids} value={password} onChange={setPassword} autoComplete="current-password" icon={<KeyRound className="h-[18px] w-[18px]" />} className={FIELD} />}
      </Field>
      <Button type="submit" size="lg" className={cn("w-full", BRAND_ACTION)} leftIcon={<LogIn className="h-[18px] w-[18px]" />} loading={busy} disabled={!identifier.trim() || !password}>
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
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Branding over a photograph of students studying together (large screens) */}
      <aside className="relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between">
        <Image src="/images/students.jpg" alt="" fill priority sizes="55vw" className="object-cover object-center" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(165deg,rgb(11_26_48/0.9)_0%,rgb(20_45_80/0.78)_45%,rgb(31_127_179/0.58)_100%)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(to_top,rgb(11_26_48/0.85),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[rgb(85_184_232/0.18)] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute top-36 right-12 h-24 w-24 opacity-25 [background-image:radial-gradient(rgb(159_214_242)_1px,transparent_1.5px)] [background-size:14px_14px]" />

        {/* top-left: logo and name */}
        <div className="relative z-10 flex items-center gap-3 px-10 pt-10 xl:px-14 xl:pt-12">
          <BrandLogo size={48} priority className="drop-shadow-[0_6px_18px_rgb(85_184_232/0.4)]" />
          <div className="min-w-0 leading-none">
            <BrandName className="block text-[28px]" />
            <span className="mt-1.5 block font-display text-[13px] font-semibold tracking-wide text-[var(--sky-100)]/90">{t("auth.brandSubtitle")}</span>
          </div>
        </div>

        {/* middle: message */}
        <div className="relative z-10 px-10 xl:px-14">
          <div className="max-w-[520px]">
            <div aria-hidden className="mb-6 h-1 w-12 rounded-full bg-[var(--sky-500)]" />
            <p className="font-display text-[30px] leading-[1.22] font-semibold text-white xl:text-[34px]">{t("auth.brandTagline")}</p>
            <p className="mt-5 max-w-[460px] text-[15px] leading-7 text-white/80">{t("auth.brandDescription")}</p>
          </div>
        </div>

        {/* bottom: phrase, platform highlights, divider */}
        <div className="relative z-10 px-10 pb-10 xl:px-14 xl:pb-12">
          <div aria-hidden className="h-px w-full bg-[linear-gradient(to_right,rgb(255_255_255/0.28),rgb(255_255_255/0.04))]" />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-white/90">
              <Sparkles aria-hidden className="h-4 w-4 text-[var(--sky-500)]" />
              {t("auth.brandFooter")}
            </p>
            <span className="text-xs text-white/50">© ExamHub</span>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {([[ShieldCheck, "auth.brandSecure"], [Languages, "auth.brandBilingual"], [Network, "auth.brandCampus"]] as const).map(([Icon, key]) => (
              <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
                <Icon aria-hidden className="h-3.5 w-3.5 text-[var(--sky-300)]" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex min-w-0 flex-col bg-[linear-gradient(180deg,var(--background-cream)_0%,var(--background)_480px)]">
        <div className="flex items-center justify-end gap-1 px-4 py-4 sm:gap-2 sm:px-8">
          <LanguageSwitch />
          <ThemeMenu />
        </div>

        {/* Short photo banner instead of the side panel (phones and tablets) */}
        <div className="relative mx-4 overflow-hidden rounded-2xl text-white sm:mx-8 lg:hidden">
          <Image src="/images/students.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(160deg,rgb(11_26_48/0.9),rgb(20_45_80/0.76)_60%,rgb(31_127_179/0.6))]" />
          <div className="relative flex items-center gap-4 p-5 sm:p-6">
            <BrandLogo size={48} priority />
            <div className="min-w-0">
              <BrandName className="block text-[26px] leading-none" />
              <p className="mt-1.5 font-display text-[13px] font-semibold tracking-wide text-[var(--sky-100)]">{t("auth.brandSubtitle")}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-start justify-center px-4 py-6 sm:items-center sm:px-8 sm:py-10">
          <Card className="w-full max-w-[440px] p-7 shadow-raised sm:p-10">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{mustChange ? t("auth.changeTitle") : t("auth.signInTitle")}</h1>
            {!mustChange && <p className="mt-2 mb-8 text-sm leading-relaxed text-muted">{t("auth.signInSubtitle")}</p>}
            <div className={mustChange ? "mt-6" : undefined}>
              {isLoading ? null : mustChange ? <ChangePasswordForm forced onChanged={done} /> : <SignInForm onSignedIn={done} />}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
