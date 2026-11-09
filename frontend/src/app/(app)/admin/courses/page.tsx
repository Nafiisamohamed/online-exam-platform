"use client";

/**
 * Course management: GET /api/courses returns every course for the admin (not
 * paged), so search and the semester / faculty filters work in the browser
 * without asking the server again.
 */
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterBar, FormError } from "@/components/admin/admin-ui";
import { CourseModal } from "@/components/admin/course-forms";
import { CourseTable } from "@/components/admin/course-table";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { deleteCourse, paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import { SEMESTERS, type AcademicYear, type Course, type Faculty } from "@/types/admin";

export default function CoursesPage() {
  const { t } = useI18n();
  const courses = useApi<{ items: Course[] }>(paths.courses());
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const years = useApi<{ items: AcademicYear[] }>(paths.academicYears);
  const [search, setSearch] = useState("");
  // "" = all, otherwise a year id.
  const [yearId, setYearId] = useState("");
  const [semesterNumber, setSemesterNumber] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [modal, setModal] = useState<{ course?: Course } | null>(null);
  const toast = useToast();
  const [removing, setRemoving] = useState<Course | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCourse(removing.id);
      toast(t("admin.courses.deletedToast", { code: removing.code }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  const all = useMemo(() => courses.data?.items ?? [], [courses.data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (c) =>
        (!yearId || c.academicYearId === yearId) &&
        (!semesterNumber || c.semesterNumber === Number(semesterNumber)) &&
        (!facultyId || c.facultyId === facultyId) &&
        (!q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.lecturer.fullName.toLowerCase().includes(q)),
    );
  }, [all, search, yearId, semesterNumber, facultyId]);

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.courses") }]} />}
        title={t("admin.courses.title")}
        description={t("admin.courses.subtitle")}
        actions={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({})}>{t("admin.courses.add")}</Button>}
      />
      <FilterBar>
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.courses.search")} />}
        </Field>
        <Field label={t("admin.academic.year")}>
          {({ id }) => (
            <Select id={id} value={yearId} onChange={(e) => setYearId(e.target.value)}>
              <option value="">{t("admin.academic.allYears")}</option>
              {years.data?.items.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.academic.semester")}>
          {({ id }) => (
            <Select id={id} value={semesterNumber} onChange={(e) => setSemesterNumber(e.target.value)}>
              <option value="">{t("admin.courses.allSemesters")}</option>
              {SEMESTERS.map((n) => <option key={n} value={n}>{t("admin.academic.semesterN", { n })}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.courses.faculty")}>
          {({ id }) => (
            <Select id={id} value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
              <option value="">{t("admin.faculties.allFaculties")}</option>
              {faculties.data?.items.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
            </Select>
          )}
        </Field>
      </FilterBar>
      <FormError error={error} />
      <Card className="overflow-hidden">
        {courses.error && !courses.data ? (
          <QueryError state={courses} />
        ) : (
          <CourseTable
            rows={rows}
            loading={!courses.data}
            actions={(c) => (
              <span className="inline-flex gap-1">
                <Button variant="ghost" size="sm" leftIcon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setModal({ course: c })}>{t("common.edit")}</Button>
                <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setRemoving(c)}>{t("common.delete")}</Button>
              </span>
            )}
          />
        )}
      </Card>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("admin.courses.deleteTitle", { code: removing?.code ?? "" })}
        description={t("admin.courses.deleteBody")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={busy}
        onConfirm={remove}
      />
      {modal && <CourseModal course={modal.course} open onOpenChange={(o) => !o && setModal(null)} />}
    </>
  );
}
