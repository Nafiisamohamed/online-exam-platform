"use client";

/** Add a faculty (POST /api/faculties) or change its code and name (PATCH /api/faculties/:id). */
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { checks, validateForm } from "@/lib/admin/validation";
import { createFaculty, updateFaculty } from "@/lib/api/admin";
import { useI18n, type MessageKey } from "@/lib/i18n/i18n";
import type { Faculty } from "@/types/admin";
import { FormError } from "./admin-ui";

export function FacultyModal({ faculty, open, onOpenChange }: { faculty?: Faculty; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const editing = !!faculty;
  const [code, setCode] = useState(faculty?.code ?? "");
  const [name, setName] = useState(faculty?.name ?? "");
  const [errors, setErrors] = useState<Partial<Record<"code" | "name", MessageKey>>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateForm({ code: checks.code(code), name: checks.name(name) });
    setErrors(found);
    if (Object.keys(found).length) return;
    const patch = editing ? { ...(code.trim() !== faculty.code ? { code: code.trim() } : {}), ...(name.trim() !== faculty.name ? { name: name.trim() } : {}) } : {};
    if (editing && Object.keys(patch).length === 0) return onOpenChange(false);
    setBusy(true);
    setServerError(null);
    try {
      if (editing) {
        await updateFaculty(faculty.id, patch);
        toast(t("admin.saved"));
      } else {
        const f = await createFaculty({ code: code.trim(), name: name.trim() });
        toast(t("admin.faculties.createdToast", { code: f.code }));
      }
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
      title={editing ? t("admin.faculties.editTitle") : t("admin.faculties.createTitle")}
      closeLabel={t("common.cancel")}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="faculty-form" loading={busy}>{editing ? t("common.save") : t("admin.faculties.add")}</Button>
        </>
      }
    >
      <form id="faculty-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={serverError} />
        <Field label={t("admin.faculties.code")} hint={t("admin.faculties.codeHint")} error={errors.code && t(errors.code)} required>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} autoComplete="off" />
          )}
        </Field>
        <Field label={t("admin.faculties.name")} error={errors.name && t(errors.name)} required>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" />}
        </Field>
      </form>
    </Modal>
  );
}
