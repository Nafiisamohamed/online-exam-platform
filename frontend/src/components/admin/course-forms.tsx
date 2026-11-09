"use client";

/**
 * Create a course (POST /api/courses) or edit one (PATCH /api/courses/:id).
 * A course belongs to a faculty, an academic year and a semester (1-8). The code is fixed after
 * creation; the name, faculty, lecturer, academic year and semester can change. Only lecturers
 * assigned to the chosen faculty are offered (GET /api/faculties/:id/lecturers); the server
 * checks the same rule. Courses created before academic years existed can be completed here.
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
import { SEMESTERS, type AcademicYear, type Course, type Faculty, type FacultyLecturer } from "@/types/admin";
import { FormError } from "./admin-ui";

type Fields = "facultyId" | "code" | "name" | "academicYearId" | "semesterNumber" | "lecturerId";

export function CourseModal({ course, open, onOpenChange, defaultFacultyId }: { course?: Course; open: boolean; onOpenChange: (open: boolean) => void; defaultFacultyId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const editing = !!course;
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const years = useApi<{ items: AcademicYear[] }>(paths.academicYears);

  const [facultyId, setFacultyId] = useState(course?.facultyId ?? defaultFacultyId ?? "");
  const [code, setCode] = useState(course?.code ?? "");
  const [name, setName] = useState(course?.name ?? "");
  const [yearChoice, setAcademicYearId] = useState(course?.academicYearId ?? "");
  const [semesterNumber, setSemesterNumber] = useState(course?.semesterNumber ? String(course.semesterNumber) : "");
  const [lecturerId, setLecturerId] = useState(course?.lecturerId ?? "");
  const [errors, setErrors] = useState<Partial<Record<Fields, MessageKey>>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const lecturers = useApi<{ items: FacultyLecturer[] }>(facultyId ? paths.facultyLecturers(facultyId) : null);

  // A new course defaults to the current academic year until another is chosen.
  const currentYearId = years.data?.items.find((y) => y.isCurrent)?.id ?? "";
  const academicYearId = yearChoice || (editing ? "" : currentYearId);

  const lecturerOptions = (lecturers.data?.items ?? []).filter((l) => l.isActive || l.id === course?.lecturerId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateForm<Fields>({
      facultyId: checks.required(facultyId),
      code: editing ? null : checks.code(code),
      name: checks.name(name),
      academicYearId: checks.required(academicYearId),
      semesterNumber: checks.required(semesterNumber),
      lecturerId: checks.required(lecturerId),
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setServerError(null);
    try {
      if (editing) {
        const offeringChanged = academicYearId !== (course.academicYearId ?? "") || Number(semesterNumber) !== course.semesterNumber;
        const patch = {
          ...(name.trim() !== course.name ? { name: name.trim() } : {}),
          ...(facultyId !== course.facultyId ? { facultyId } : {}),
          ...(lecturerId !== course.lecturerId ? { lecturerId } : {}),
          ...(offeringChanged ? { academicYearId, semesterNumber: Number(semesterNumber) } : {}),
        };
        if (Object.keys(patch).length) {
          await updateCourse(course.id, patch);
          toast(t("admin.saved"));
        }
      } else {
        const c = await createCourse({ facultyId, code: code.trim(), name: name.trim(), academicYearId, semesterNumber: Number(semesterNumber), lecturerId });
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
  const noYears = years.data && years.data.items.length === 0;
  const noLecturers = !!facultyId && lecturers.data && lecturerOptions.length === 0;

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
          <Button type="submit" form="course-form" loading={busy} disabled={!!noFaculties || !!noYears || !!noLecturers}>{editing ? t("common.save") : t("admin.courses.add")}</Button>
        </>
      }
    >
      <form id="course-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={serverError} />
        {noFaculties && <Alert tone="warning"><Link href="/admin/faculties" className="font-semibold underline">{t("admin.courses.noFaculties")}</Link></Alert>}
        {noYears && <Alert tone="warning"><Link href="/admin/academic-years" className="font-semibold underline">{t("admin.courses.noYears")}</Link></Alert>}
        {editing && !course.academicYearId && <Alert tone="info">{t("admin.courses.completeOffering", { label: course.semester })}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.courses.code")} hint={editing ? undefined : t("admin.courses.codeHint")} error={errors.code && t(errors.code)} required={!editing}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} disabled={editing} autoComplete="off" />}
          </Field>
          <Field label={t("admin.courses.faculty")} error={errors.facultyId && t(errors.facultyId)} required>
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={facultyId} onChange={(e) => { setFacultyId(e.target.value); if (!editing) setLecturerId(""); }} disabled={!faculties.data}>
                <option value="">{t("admin.courses.chooseFaculty")}</option>
                {faculties.data?.items.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("admin.courses.name")} error={errors.name && t(errors.name)} required>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.academic.year")} error={errors.academicYearId && t(errors.academicYearId)} required>
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} disabled={!years.data}>
                <option value="">{t("admin.academic.chooseYear")}</option>
                {years.data?.items.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ` (${t("admin.academic.current")})` : ""}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("admin.academic.semester")} error={errors.semesterNumber && t(errors.semesterNumber)} required>
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={semesterNumber} onChange={(e) => setSemesterNumber(e.target.value)}>
                <option value="">{t("admin.academic.chooseSemester")}</option>
                {SEMESTERS.map((n) => <option key={n} value={n}>{t("admin.academic.semesterN", { n })}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("admin.courses.lecturer")} hint={t("admin.courses.lecturerHint")} error={errors.lecturerId && t(errors.lecturerId)} required>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={lecturerId} onChange={(e) => setLecturerId(e.target.value)} disabled={!facultyId || !lecturers.data}>
              <option value="">{facultyId ? t("admin.courses.chooseLecturer") : t("admin.courses.chooseFacultyFirst")}</option>
              {lecturerOptions.map((l) => <option key={l.id} value={l.id}>{l.fullName} ({l.username})</option>)}
            </Select>
          )}
        </Field>
        {noLecturers && <Alert tone="warning"><Link href={`/admin/faculties/${facultyId}`} className="font-semibold underline">{t("admin.courses.noFacultyLecturers")}</Link></Alert>}
        {(faculties.error || years.error || lecturers.error) && <FormError error={faculties.error ?? years.error ?? lecturers.error} />}
      </form>
    </Modal>
  );
}
