"use client";

/**
 * Results (registrar, read only): search every student's examination results by student, faculty,
 * academic year, semester, course, exam type, exam and publication status (GET /api/results-search).
 * The registrar only looks: grading, publishing and revising stay with the course lecturer, and the
 * server refuses those actions for the registrar.
 */
import { useState } from "react";
import { FilterBar } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { ExamTypeBadge } from "@/components/exam-type-badge";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { useDebounced } from "@/hooks/use-debounced";
import { paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { EXAM_TYPES, SEMESTERS, type AcademicYear, type Course, type ExamListItem, type Faculty, type ResultSearchPage, type ResultSearchRow } from "@/types/admin";

const PAGE_SIZE = 25;
const PUBLICATION_TONE: Record<string, BadgeTone> = { PUBLISHED: "success", UNPUBLISHED: "neutral", REOPENED: "warning" };
type Filters = { academicYearId: string; facultyId: string; semesterNumber: string; courseId: string; examType: string; examId: string; publication: string };

export default function RegistrarResultsPage() {
  const { t, locale } = useI18n();
  const years = useApi<{ items: AcademicYear[] }>(paths.academicYears);
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const [f, setF] = useState<Filters>({ academicYearId: "", facultyId: "", semesterNumber: "", courseId: "", examType: "", examId: "", publication: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim());
  const courses = useApi<{ items: Course[] }>(paths.courses({ facultyId: f.facultyId || undefined, academicYearId: f.academicYearId || undefined, semesterNumber: f.semesterNumber ? Number(f.semesterNumber) : undefined }));
  const exams = useApi<{ items: ExamListItem[] }>(f.courseId ? paths.exams({ courseId: f.courseId }) : null);
  const list = useApi<ResultSearchPage>(
    paths.resultsSearch({
      search: term || undefined, academicYearId: f.academicYearId || undefined, facultyId: f.facultyId || undefined,
      semesterNumber: f.semesterNumber ? Number(f.semesterNumber) : undefined, courseId: f.courseId || undefined,
      examType: f.examType || undefined, examId: f.examId || undefined, publication: f.publication || undefined, page, pageSize: PAGE_SIZE,
    }),
    { keepPrevious: true },
  );
  // Changing a wider filter clears the narrower ones that may no longer match.
  const set = (key: keyof Filters) => (value: string) => {
    setF((old) => {
      const next = { ...old, [key]: value };
      if (key === "academicYearId" || key === "facultyId" || key === "semesterNumber") { next.courseId = ""; next.examId = ""; }
      if (key === "courseId") next.examId = "";
      return next;
    });
    setPage(1);
  };

  const columns: Column<ResultSearchRow>[] = [
    { key: "student", header: t("admin.enrolment.student"), primary: true, cell: (r) => <span className="block min-w-0"><span className="block font-semibold text-foreground">{r.student.fullName}</span><span className="block text-xs text-muted">{r.student.username}</span></span> },
    {
      key: "exam",
      header: t("admin.results.exam"),
      cell: (r) => (
        <span className="block min-w-0">
          <span className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">{r.exam.title} <ExamTypeBadge type={r.exam.examType} /></span>
          <span className="block text-xs text-muted">{r.course.code} · {r.faculty.code}{r.academicYear ? ` · ${r.academicYear.name}` : ""}{r.course.semesterNumber ? ` · ${t("admin.academic.semesterN", { n: r.course.semesterNumber })}` : ""}</span>
        </span>
      ),
    },
    {
      key: "score",
      header: t("admin.results.score"),
      align: "right",
      cell: (r) => (r.grade
        ? <span className="whitespace-nowrap tabular-nums"><span className="font-semibold text-foreground">{r.grade.letterGrade}</span> · {r.grade.percentage.toFixed(1)}% <span className="text-xs text-muted">({r.grade.totalScore}/{r.grade.maxScore})</span></span>
        : <span className="text-xs text-muted">{t("admin.results.notGraded")}</span>),
    },
    {
      key: "publication",
      header: t("admin.results.publication"),
      cell: (r) => (
        <span className="block">
          <Badge tone={PUBLICATION_TONE[r.exam.resultsStatus]} dot>{t(`admin.exams.results.${r.exam.resultsStatus}`)}</Badge>
          {r.lastPublication && <span className="mt-1 block text-xs text-muted">{t("admin.results.publishedN", { n: r.lastPublication.publicationNumber, date: formatDateTime(r.lastPublication.publishedAt, locale) })}</span>}
        </span>
      ),
    },
    {
      key: "submitted",
      header: t("admin.results.submitted"),
      className: "hidden lg:table-cell",
      cell: (r) => <span className="block text-sm text-muted">{formatDateTime(r.submittedAt, locale)}{r.attemptStatus === "TERMINATED" && <span className="block text-xs text-danger">{t("admin.results.terminated")}</span>}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.allResults") }]} />}
        title={t("admin.results.title")}
        description={t("admin.results.subtitle")}
      />
      <Alert tone="info" className="mb-4">{t("admin.results.readOnly")}</Alert>
      <FilterBar>
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t("admin.academic.searchStudent")} />}
        </Field>
        <Field label={t("admin.courses.faculty")}>
          {({ id }) => (
            <Select id={id} value={f.facultyId} onChange={(e) => set("facultyId")(e.target.value)}>
              <option value="">{t("admin.faculties.allFaculties")}</option>
              {faculties.data?.items.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.academic.year")}>
          {({ id }) => (
            <Select id={id} value={f.academicYearId} onChange={(e) => set("academicYearId")(e.target.value)}>
              <option value="">{t("admin.academic.allYears")}</option>
              {years.data?.items.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.academic.semester")}>
          {({ id }) => (
            <Select id={id} value={f.semesterNumber} onChange={(e) => set("semesterNumber")(e.target.value)}>
              <option value="">{t("admin.courses.allSemesters")}</option>
              {SEMESTERS.map((n) => <option key={n} value={n}>{t("admin.academic.semesterN", { n })}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.results.course")}>
          {({ id }) => (
            <Select id={id} value={f.courseId} onChange={(e) => set("courseId")(e.target.value)}>
              <option value="">{t("admin.courses.allCourses")}</option>
              {courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.results.examType")}>
          {({ id }) => (
            <Select id={id} value={f.examType} onChange={(e) => set("examType")(e.target.value)}>
              <option value="">{t("admin.results.allTypes")}</option>
              {EXAM_TYPES.map((x) => <option key={x} value={x}>{t(`examTypes.${x}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.results.exam")}>
          {({ id }) => (
            <Select id={id} value={f.examId} onChange={(e) => set("examId")(e.target.value)} disabled={!f.courseId}>
              <option value="">{f.courseId ? t("admin.results.allExams") : t("admin.results.chooseCourseFirst")}</option>
              {exams.data?.items.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.results.publication")}>
          {({ id }) => (
            <Select id={id} value={f.publication} onChange={(e) => set("publication")(e.target.value)}>
              <option value="">{t("admin.allStatuses")}</option>
              {(["PUBLISHED", "UNPUBLISHED", "REOPENED"] as const).map((s) => <option key={s} value={s}>{t(`admin.exams.results.${s}`)}</option>)}
            </Select>
          )}
        </Field>
      </FilterBar>
      <Card className="overflow-hidden">
        {list.error && !list.data ? <QueryError state={list} /> : (
          <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(r) => r.attemptId} loading={!list.data} emptyTitle={t("admin.results.noResults")} caption={t("admin.results.title")} />
        )}
        {list.data && list.data.total > 0 && (
          <div className="border-t border-border px-5 py-4"><Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={setPage} /></div>
        )}
      </Card>
    </>
  );
}
