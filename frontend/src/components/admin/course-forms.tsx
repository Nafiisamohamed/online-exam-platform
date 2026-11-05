"use client";

/**
 * Create a course (POST /api/courses) or edit one (PATCH /api/courses/:id).
 * Code and semester are fixed after creation (they identify the course);
 * the name, faculty and lecturer can change. Lecturers come from
 * GET /api/staff?role=LECTURER, which lists active lecturers only.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { checks, validateForm } from "@/lib/admin/validation";
import { createCourse, paths, updateCourse } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { useI18n, type MessageKey } from "@/lib/i18n/i18n";
import type { Course, Faculty, StaffMember } from "@/types/admin";
import { FormError } from "./admin-ui";

type Fields = "facultyId" | "code" | "name" | "semester" | "lecturerId";

export function CourseModal({ course, open, onOpenChange, defaultFacultyId }: { course?: Course; open: boolean; onOpenChange: (open: boolean) => void; defaultFacultyId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const editing = !!course;
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const lecturers = useApi<{ items: StaffMember[] }>(paths.staff("LECTURER"));

  const [facultyId, setFacultyId] = useState(course?.facultyId ?? defaultFacultyId ?? "");
  const [code, setCode] = useState(course?.code ?? "");
  const [name, setName] = useState(course?.name ?? "");
  const [semester, setSemester] = useState(course?.semester ?? "");
  const [lecturerId, setLecturerId] = useState(course?.lecturerId ?? "");
  const [errors, setErrors] = useState<Partial<Record<Fields, MessageKey>>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // An inactive current lecturer is not in the staff list; keep them selectable so the form shows the truth.
  const lecturerOptions = [...(lecturers.data?.items ?? [])];
  if (course && !lecturerOptions.some((l) => l.id === course.lecturerId)) lecturerOptions.unshift(course.lecturer);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateForm<Fields>({
      facultyId: checks.required(facultyId),
      code: editing ? null : checks.code(code),
      name: checks.name(name),
      semester: editing ? null : checks.semester(semester),
      lecturerId: checks.required(lecturerId),
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setServerError(null);
    try {
      if (editing) {
        const patch = {
          ...(name.trim() !== course.name ? { name: name.trim() } : {}),
          ...(facultyId !== course.facultyId ? { facultyId } : {}),
          ...(lecturerId !== course.lecturerId ? { lecturerId } : {}),
        };
        if (Object.keys(patch).length) {
          await updateCourse(course.id, patch);
          toast(t("admin.saved"));
        }
      } else {
        const c = await createCourse({ facultyId, code: code.trim(), name: name.trim(), semester: semester.trim(), lecturerId });
        toast(t("admin.courses.createdToast", { code: c.code }));
      }
      onOpenChange(false);
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  };

  const noFaculties = faculties.data && faculties.data.items.length === 0;
  const noLecturers = lecturers.data && lecturerOptions.length === 0;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("admin.courses.editTitle") : t("admin.courses.createTitle")}
      closeLabel={t("common.cancel")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="course-form" loading={busy} disabled={!!noFaculties || !!noLecturers}>{editing ? t("common.save") : t("admin.courses.add")}</Button>
        </>
      }
    >
      <form id="course-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={serverError} />
        {noFaculties && <Alert tone="warning"><Link href="/admin/faculties" className="font-semibold underline">{t("admin.courses.noFaculties")}</Link></Alert>}
        {noLecturers && <Alert tone="warning"><Link href="/admin/users" className="font-semibold underline">{t("admin.courses.noLecturers")}</Link></Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.courses.code")} hint={editing ? undefined : t("admin.courses.codeHint")} error={errors.code && t(errors.code)} required={!editing}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} disabled={editing} autoComplete="off" />}
          </Field>
          <Field label={t("admin.courses.semester")} hint={editing ? undefined : t("admin.courses.semesterHint")} error={errors.semester && t(errors.semester)} required={!editing}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="2026-Fall" maxLength={15} disabled={editing} autoComplete="off" />}
          </Field>
        </div>
        <Field label={t("admin.courses.name")} error={errors.name && t(errors.name)} required>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.courses.faculty")} error={errors.facultyId && t(errors.facultyId)} required>
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={facultyId} onChange={(e) => setFacultyId(e.target.value)} disabled={!faculties.data}>
                <option value="">{t("admin.courses.chooseFaculty")}</option>
                {faculties.data?.items.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("admin.courses.lecturer")} error={errors.lecturerId && t(errors.lecturerId)} required>
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={lecturerId} onChange={(e) => setLecturerId(e.target.value)} disabled={!lecturers.data}>
                <option value="">{t("admin.courses.chooseLecturer")}</option>
                {lecturerOptions.map((l) => <option key={l.id} value={l.id}>{l.fullName}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {(faculties.error || lecturers.error) && <FormError error={faculties.error ?? lecturers.error} />}
      </form>
    </Modal>
  );
}
