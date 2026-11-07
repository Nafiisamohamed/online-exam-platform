"use client";

/**
 * Examination oversight (read-only): every exam from GET /api/exams, with the
 * lecturer and enrolled count from GET /api/courses. Stages are worked out
 * from the exam status and its schedule (lib/admin/exam-state.ts).
 */
import { useMemo, useState } from "react";
import { FilterBar } from "@/components/admin/admin-ui";
import { ExamTable } from "@/components/admin/exam-table";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { useNow } from "@/hooks/use-now";
import { EXAM_STATES, examState, type ExamState } from "@/lib/admin/exam-state";
import { paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course, ExamListItem } from "@/types/admin";

export default function ExamOversightPage() {
  const { t } = useI18n();
  const now = useNow();
  const exams = useApi<{ items: ExamListItem[] }>(paths.exams());
  const courses = useApi<{ items: Course[] }>(paths.courses());
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<ExamState | "">("");
  const [courseId, setCourseId] = useState("");

  const courseMap = useMemo(() => new Map((courses.data?.items ?? []).map((c) => [c.id, c])), [courses.data]);
  const all = useMemo(() => exams.data?.items ?? [], [exams.data]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(EXAM_STATES.map((s) => [s, 0])) as Record<ExamState, number>;
    for (const e of all) c[examState(e, now)]++;
    return c;
  }, [all, now]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (e) =>
        (!stage || examState(e, now) === stage) &&
        (!courseId || e.course.id === courseId) &&
        (!q || e.title.toLowerCase().includes(q) || e.course.code.toLowerCase().includes(q) || e.course.name.toLowerCase().includes(q)),
    );
  }, [all, search, stage, courseId, now]);

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.examOversight") }]} />}
        title={t("admin.exams.title")}
      />
      <Alert tone="info" className="mb-4">{t("admin.exams.readOnlyNote")}</Alert>

      {exams.data && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t("admin.exams.stage")}>
          {EXAM_STATES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={stage === s}
              onClick={() => setStage(stage === s ? "" : s)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                stage === s ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground",
              )}
            >
              {t(`admin.exams.states.${s}`)}
              <span className={cn("rounded-full px-1.5 tabular-nums", stage === s ? "bg-white/20" : "bg-surface-sunken")}>{counts[s]}</span>
            </button>
          ))}
        </div>
      )}

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
        <Field label={t("admin.exams.course")}>
          {({ id }) => (
            <Select id={id} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">{t("admin.courses.allCourses")}</option>
              {courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.semester})</option>)}
            </Select>
          )}
        </Field>
      </FilterBar>

      <Card className="overflow-hidden">
        {exams.error && !exams.data ? <QueryError state={exams} /> : <ExamTable exams={rows} courses={courseMap} now={now} loading={!exams.data} />}
      </Card>
    </>
  );
}
