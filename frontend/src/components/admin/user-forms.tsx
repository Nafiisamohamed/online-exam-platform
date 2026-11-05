"use client";

/**
 * Create and edit dialogs for user accounts (POST /api/users, PATCH /api/users/:id).
 * - Students sign in with a student number, staff with an email (the API requires one or the other).
 * - After creating, the temporary password returned by the API is shown once in the same dialog.
 * - Editing covers only what the API allows: name, phone and preferred language.
 */
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { checks, normalizeSomaliPhone, validateForm } from "@/lib/admin/validation";
import { createUser, updateUser } from "@/lib/api/admin";
import { useI18n, type MessageKey } from "@/lib/i18n/i18n";
import type { AdminUser } from "@/types/admin";
import { ROLES, type Role } from "@/types/account";
import { FormError, TemporaryPassword } from "./admin-ui";

type Errors = Partial<Record<"fullName" | "phone" | "email" | "studentNumber", MessageKey>>;

export function CreateUserModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [role, setRole] = useState<Role>("STUDENT");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [language, setLanguage] = useState<"so" | "en">("so");
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ user: AdminUser; temporaryPassword: string } | null>(null);
  const isStudent = role === "STUDENT";

  const reset = () => {
    setRole("STUDENT"); setFullName(""); setPhone(""); setEmail(""); setStudentNumber(""); setLanguage("so");
    setErrors({}); setServerError(null); setCreated(null);
  };
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset(); // the temporary password is forgotten as soon as the dialog closes
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateForm({
      fullName: checks.fullName(fullName),
      phone: checks.phone(phone),
      email: isStudent ? null : checks.email(email),
      studentNumber: isStudent ? checks.studentNumber(studentNumber) : null,
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setServerError(null);
    try {
      const res = await createUser({
        role,
        fullName: fullName.trim(),
        phone: normalizeSomaliPhone(phone) ?? phone.trim(),
        preferredLanguage: language,
        ...(isStudent ? { studentNumber: studentNumber.trim() } : { email: email.trim() }),
      });
      setCreated(res);
      toast(t("admin.users.createdToast", { name: res.user.fullName }));
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Modal open={open} onOpenChange={close} title={t("admin.users.tempTitle")} closeLabel={t("common.close")} footer={<Button onClick={() => close(false)}>{t("admin.users.done")}</Button>}>
        <TemporaryPassword name={created.user.fullName} login={created.user.studentNumber ?? created.user.email} password={created.temporaryPassword} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={t("admin.users.createTitle")}
      description={t("admin.users.createHint")}
      closeLabel={t("common.cancel")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="create-user" loading={busy}>{t("admin.users.createAction")}</Button>
        </>
      }
    >
      <form id="create-user" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={serverError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.users.role")} required>
            {({ id }) => (
              <Select id={id} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("admin.users.preferredLanguage")}>
            {({ id }) => (
              <Select id={id} value={language} onChange={(e) => setLanguage(e.target.value as "so" | "en")}>
                <option value="so">{t("language.so")}</option>
                <option value="en">{t("language.en")}</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("profile.fullName")} error={errors.fullName && t(errors.fullName)} required>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={150} autoComplete="off" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {isStudent ? (
            <Field label={t("admin.users.studentNumber")} error={errors.studentNumber && t(errors.studentNumber)} required>
              {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} maxLength={30} autoComplete="off" />}
            </Field>
          ) : (
            <Field label={t("admin.users.email")} error={errors.email && t(errors.email)} required>
              {({ id, describedBy, invalid }) => <Input id={id} type="email" aria-describedby={describedBy} aria-invalid={invalid} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="off" />}
            </Field>
          )}
          <Field label={t("admin.users.phone")} hint={t("admin.users.phoneHint")} error={errors.phone && t(errors.phone)} required>
            {({ id, describedBy, invalid }) => <Input id={id} type="tel" aria-describedby={describedBy} aria-invalid={invalid} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function EditUserModal({ user, open, onOpenChange }: { user: AdminUser; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone);
  const [language, setLanguage] = useState(user.preferredLanguage);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateForm({ fullName: checks.fullName(fullName), phone: checks.phone(phone) });
    setErrors(found);
    if (Object.keys(found).length) return;
    const patch = {
      ...(fullName.trim() !== user.fullName ? { fullName: fullName.trim() } : {}),
      ...((normalizeSomaliPhone(phone) ?? phone) !== user.phone ? { phone: normalizeSomaliPhone(phone) ?? phone.trim() } : {}),
      ...(language !== user.preferredLanguage ? { preferredLanguage: language } : {}),
    };
    if (Object.keys(patch).length === 0) return onOpenChange(false);
    setBusy(true);
    setServerError(null);
    try {
      await updateUser(user.id, patch);
      toast(t("admin.saved"));
      onOpenChange(false);
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("admin.users.editTitle")}
      description={t("admin.users.editHint")}
      closeLabel={t("common.cancel")}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="edit-user" loading={busy}>{t("common.save")}</Button>
        </>
      }
    >
      <form id="edit-user" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={serverError} />
        <Field label={t("profile.fullName")} error={errors.fullName && t(errors.fullName)} required>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={150} />}
        </Field>
        <Field label={t("admin.users.phone")} hint={t("admin.users.phoneHint")} error={errors.phone && t(errors.phone)} required>
          {({ id, describedBy, invalid }) => <Input id={id} type="tel" aria-describedby={describedBy} aria-invalid={invalid} value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
        <Field label={t("admin.users.preferredLanguage")}>
          {({ id }) => (
            <Select id={id} value={language} onChange={(e) => setLanguage(e.target.value as "so" | "en")}>
              <option value="so">{t("language.so")}</option>
              <option value="en">{t("language.en")}</option>
            </Select>
          )}
        </Field>
      </form>
    </Modal>
  );
}
