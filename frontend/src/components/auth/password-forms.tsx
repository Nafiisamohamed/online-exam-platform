"use client";

/**
 * Password fields shared by the sign-in page (required change of a temporary
 * password) and the profile page (voluntary change). Both call
 * POST /api/auth/change-password, which checks the current password, applies
 * the password rule, ends the user's other sessions and returns a fresh session.
 */
import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/i18n";
import type { Profile } from "@/types/account";

/**
 * Brand colour for the sign-in page's main actions, the same in light and dark mode:
 * sky blue (#1f7fb3, readable with white text) that turns navy on hover, with a soft transition.
 */
export const BRAND_ACTION =
  "bg-[var(--sky-700)] text-white shadow-[0_6px_18px_rgb(31_127_179/0.32)] transition-[background-color,box-shadow,transform] duration-300 ease-out hover:bg-[var(--navy-900)] hover:shadow-[0_8px_22px_rgb(20_45_80/0.38)] focus-visible:ring-2 focus-visible:ring-[var(--sky-500)] focus-visible:ring-offset-2";

/** Same rule as the API (lib/passwords.ts): at least 8 characters, with a letter and a digit. */
export const passwordOk = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/** icon: optional symbol shown inside the field on the left (the sign-in page uses a key). */
export function PasswordInput({ id, describedBy, invalid, value, onChange, autoComplete, icon, className }: { id: string; describedBy?: string; invalid: boolean; value: string; onChange: (v: string) => void; autoComplete: string; icon?: ReactNode; className?: string }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      {icon && <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle">{icon}</span>}
      <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className={cn("pr-11", icon && "pl-11", className)} required />
      <button type="button" onClick={() => setShown((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-subtle hover:text-foreground" aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}>
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** forced: the user signed in with a temporary password and cannot use anything else until this is done. */
export function ChangePasswordForm({ forced, onChanged, onCancel }: { forced?: boolean; onChanged: (user: Profile) => void; onCancel?: () => void }) {
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
      setCurrent("");
      setNext("");
      setRepeat("");
      onChanged(user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Alert tone={forced ? "warning" : "info"}>{forced ? t("auth.changeHint") : t("auth.changeOthersNote")}</Alert>
      <FormError error={error} />
      <Field label={forced ? t("auth.currentPassword") : t("auth.currentPasswordRegular")} required>
        {(ids) => <PasswordInput {...ids} value={current} onChange={setCurrent} autoComplete="current-password" />}
      </Field>
      <Field label={t("auth.newPassword")} hint={t("auth.passwordRule")} error={ruleError} required>
        {(ids) => <PasswordInput {...ids} value={next} onChange={setNext} autoComplete="new-password" />}
      </Field>
      <Field label={t("auth.confirmPassword")} error={repeatError} required>
        {(ids) => <PasswordInput {...ids} value={repeat} onChange={setRepeat} autoComplete="new-password" />}
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" size={forced ? "lg" : "md"} className={forced ? cn("w-full", BRAND_ACTION) : undefined} loading={busy} disabled={!current || !next || !repeat}>
          {t("auth.savePassword")}
        </Button>
      </div>
    </form>
  );
}
