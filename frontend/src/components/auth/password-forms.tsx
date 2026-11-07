"use client";

/**
 * Password fields shared by the sign-in page (required change of a temporary
 * password) and the profile page (voluntary change). Both call
 * POST /api/auth/change-password, which checks the current password, applies
 * the password rule, ends the user's other sessions and returns a fresh session.
 */
import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/i18n";
import type { Profile } from "@/types/account";

/** Same rule as the API (lib/passwords.ts): at least 8 characters, with a letter and a digit. */
export const passwordOk = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

export function PasswordInput({ id, describedBy, invalid, value, onChange, autoComplete }: { id: string; describedBy?: string; invalid: boolean; value: string; onChange: (v: string) => void; autoComplete: string }) {
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
        <Button type="submit" size={forced ? "lg" : "md"} className={forced ? "w-full" : undefined} loading={busy} disabled={!current || !next || !repeat}>
          {t("auth.savePassword")}
        </Button>
      </div>
    </form>
  );
}
