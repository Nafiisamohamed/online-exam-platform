"use client";

/**
 * The lecturer's examinations (GET /api/exams: own courses, plus exams where
 * they are the blind second grader), with stage and course filters.
 */
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar } from "@/components/admin/admin-ui";
import { ExamTable } from "@/components/admin/exam-table";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { useMyCourses } from "@/components/lecturer/course-picker";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { useNow } from "@/hooks/use-now";
import { EXAM_STATES, examState, type ExamState } from "@/lib/admin/exam-state";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { ExamListItem } from "@/types/admin";

export default function LecturerExamsPage() {
  const { t } = useI18n();
  const now = useNow();
  const exams = useApi<{ items: ExamListItem[] }>(lecturerPaths.exams());
  const courses = useMyCourses();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<ExamState | "">("");
  const [courseId, setCourseId] = useState("");
  const courseMap = useMemo(() => new Map((courses.data?.items ?? []).map((c) => [c.id, c])), [courses.data]);
  const all = useMemo(() => exams.data?.items ?? [], [exams.data]);
  // Exams of the lecturer's own courses, and exams of other courses where they only second-grade essays.
  const own = useMemo(() => all.filter((e) => !e.isSecondGrader || courseMap.has(e.course.id)), [all, courseMap]);
  const secondGrading = useMemo(() => all.filter((e) => e.isSecondGrader && !courseMap.has(e.course.id)), [all, courseMap]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return own.filter((e) => (!stage || examState(e, now) === stage) && (!courseId || e.course.id === courseId) && (!q || e.title.toLowerCase().includes(q) || e.course.code.toLowerCase().includes(q)));
  }, [own, search, stage, courseId, now]);

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.exams") }]} />}
        title={t("lecturer.exams.title")}
        description={t("lecturer.exams.subtitle")}
        actions={<Link href="/lecturer/exams/new" className={buttonClasses("primary")}><Plus className="h-4 w-4" aria-hidden />{t("lecturer.exams.add")}</Link>}
      />
      <FilterBar>
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.exams.search")} />}
        </Field>
        <Field label={t("admin.exams.stage")}>
          {({ id }) => (
            <Select id={id} value={stage} onChange={(e) => setStage(e.target.value as ExamState | "")}>
              <option value="">{t("admin.exams.allStages")}</option>
              {EXAM_STATES.map((s) => <option key={s} value={s}>{t(`admin.exams.states.${s}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("lecturer.common.course")}>
          {({ id }) => (
            <Select id={id} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">{t("admin.courses.allCourses")}</option>
              {courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </Select>
          )}
        </Field>
      </FilterBar>
      <Card className="overflow-hidden">
        {exams.error && !exams.data ? <QueryError state={exams} /> : <ExamTable exams={rows} courses={courseMap} now={now} loading={!exams.data || !courses.data} hideLecturer basePath="/lecturer/exams" />}
      </Card>
      {secondGrading.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader title={<span className="flex items-center gap-2">{t("lecturer.common.secondGrader")}<Badge tone="sky">{secondGrading.length}</Badge></span>} description={t("lecturer.exams.secondGraderView")} className="pb-4" />
          <ExamTable exams={secondGrading} courses={courseMap} now={now} hideLecturer basePath="/lecturer/grading" />
        </Card>
      )}
    </>
  );
}
