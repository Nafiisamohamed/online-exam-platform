"use client";

/**
 * Reports shared by the registrar and the lecturer, from live API data only.
 * The server scopes every endpoint to the user (the lecturer gets only their
 * own courses), and scope="lecturer" leaves out the registrar-only charts
 * (faculties, payments, SMS), which the backend sends to the registrar only.
 * - InstitutionReport: GET /api/analytics/dashboard plus the course and exam
 *   lists (participation and stage figures from lib/admin/report-data.ts);
 * - ExamReport: GET /api/exams/:id/analytics for one exam and its grades CSV.
 * The backend has no date filter or PDF export for these, so none is shown.
 */
import { Activity, CheckCircle2, Download, MousePointerClick, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChartView, DonutChartView, HorizontalBarChartView } from "@/components/charts/charts";
import { ChartCard } from "@/components/charts/chart-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Select } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { useNow } from "@/hooks/use-now";
import { EXAM_STATES } from "@/lib/admin/exam-state";
import { examStageCounts, facultyTotals, hasScores, participation, submissionSummary } from "@/lib/admin/report-data";
import { paths } from "@/lib/api/admin";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { AdminDashboard, Course, ExamListItem, Faculty } from "@/types/admin";
import { bandLabel, ExamAnalyticsView } from "./exam-analytics";
import { QueryError } from "./query-state";

export type ReportScope = "admin" | "lecturer";
const examLink = (scope: ReportScope, id: string) => (scope === "admin" ? `/admin/exams/${id}` : `/lecturer/exams/${id}`);

type ParticipationRow = ReturnType<typeof participation>[number];

function Loading() {
  return <Skeleton className="h-full w-full" />;
}

export function InstitutionReport({ scope }: { scope: ReportScope }) {
  const { t, locale } = useI18n();
  const now = useNow();
  const dashboard = useApi<AdminDashboard>(paths.dashboard);
  const isAdmin = scope === "admin";
  const faculties = useApi<{ items: Faculty[] }>(isAdmin ? paths.faculties : null);
  const courses = useApi<{ items: Course[] }>(paths.courses());
  const allExams = useApi<{ items: ExamListItem[] }>(paths.exams());

  const courseMap = useMemo(() => new Map((courses.data?.items ?? []).map((c) => [c.id, c])), [courses.data]);
  // A lecturer's exam list also holds exams they only second-grade; reports cover their own courses.
  const ownExams = useMemo(() => (allExams.data && courses.data ? { items: allExams.data.items.filter((e) => courseMap.has(e.course.id)) } : undefined), [allExams.data, courses.data, courseMap]);
  const exams = { data: ownExams };
  const perFaculty = useMemo(() => (faculties.data && courses.data ? facultyTotals(faculties.data.items, courses.data.items) : null), [faculties.data, courses.data]);
  const stages = useMemo(() => (exams.data ? examStageCounts(exams.data.items, now) : null), [exams.data, now]);
  const part = useMemo(() => (exams.data && courses.data ? participation(exams.data.items, courseMap, now) : null), [exams.data, courses.data, courseMap, now]);
  const subs = dashboard.data ? submissionSummary(dashboard.data) : null;
  const totalParticipation = part ? (() => {
    const enrolled = part.reduce((s, r) => s + r.enrolled, 0);
    return enrolled ? Math.round((part.reduce((s, r) => s + r.attempts, 0) / enrolled) * 1000) / 10 : null;
  })() : null;
  const payments = useMemo(() => {
    const byProvider = new Map<string, number>();
    for (const p of dashboard.data?.paymentsByProvider ?? []) if (p.status === "SUCCESS") byProvider.set(p.provider, (byProvider.get(p.provider) ?? 0) + p.count);
    return [...byProvider].map(([provider, count]) => ({ provider: provider.replace("_", " "), count }));
  }, [dashboard.data]);
  const failed = [dashboard, faculties, courses, allExams].find((q) => q.error && q.data === undefined);

  const partColumns: Column<ParticipationRow>[] = [
    {
      key: "exam",
      header: t("admin.exams.examination"),
      primary: true,
      cell: (r) => (
        <Link href={examLink(scope, r.exam.id)} className="group block">
          <span className="block font-semibold text-foreground group-hover:text-accent-strong">{r.exam.title}</span>
          <span className="block text-xs text-muted">{r.exam.course.code}</span>
        </Link>
      ),
    },
    { key: "enrolled", header: t("admin.exams.enrolled"), align: "right", cell: (r) => <span className="tabular-nums">{r.enrolled}</span> },
    { key: "attempts", header: t("admin.exams.attempts"), align: "right", cell: (r) => <span className="tabular-nums">{r.attempts}</span> },
    { key: "rate", header: t("admin.reports.participationRate"), align: "right", cell: (r) => <span className="font-semibold tabular-nums">{formatPercent(r.rate, locale)}</span> },
  ];

  return (
    <div className="space-y-6">
      {failed && <Card><QueryError state={failed} className="py-8" /></Card>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <StatCard emphasis label={t("admin.reports.participationRate")} value={part ? formatPercent(totalParticipation, locale) : "…"} icon={Users} hint={t("admin.reports.participation")} />
        <StatCard label={t("admin.reports.completionRate")} value={subs ? formatPercent(subs.completionRate, locale) : "…"} icon={CheckCircle2} hint={t("admin.reports.submissionsHint")} />
        <StatCard label={t("admin.reports.attemptsLabel")} value={subs ? subs.total : "…"} icon={Activity} />
        <StatCard
          label={t("admin.reports.tabSwitches")}
          value={dashboard.data ? dashboard.data.tabSwitches.countedFocusLosses : "…"}
          icon={MousePointerClick}
          hint={dashboard.data ? t("admin.reports.tabSwitchesHint", { attempts: dashboard.data.tabSwitches.attempts }) : undefined}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        {isAdmin && (<>
        <ChartCard title={t("admin.reports.studentsByFaculty")} description={t("admin.reports.studentsByFacultyHint")}>
          {!perFaculty ? <Loading /> : perFaculty.length === 0 ? <EmptyState title={t("admin.noData")} /> : (
            <BarChartView data={perFaculty.map((f) => ({ faculty: f.code, enrolments: f.enrolments }))} xKey="faculty" series={[{ key: "enrolments", label: t("admin.faculties.activeStudents") }]} />
          )}
        </ChartCard>
        <ChartCard title={t("admin.reports.facultyCourses")} description={t("admin.reports.facultyCoursesHint")}>
          {!perFaculty ? <Loading /> : perFaculty.length === 0 ? <EmptyState title={t("admin.noData")} /> : (
            <HorizontalBarChartView data={perFaculty.map((f) => ({ faculty: f.code, courses: f.courses }))} yKey="faculty" series={[{ key: "courses", label: t("admin.faculties.courses"), color: "var(--chart-3)" }]} />
          )}
        </ChartCard>
        </>)}
        <ChartCard title={t("admin.reports.examsByStage")} description={t("admin.overview.charts.examsByStateHint")}>
          {!stages ? <Loading /> : (
            <BarChartView data={EXAM_STATES.map((s) => ({ stage: t(`admin.exams.states.${s}`), count: stages[s] }))} xKey="stage" series={[{ key: "count", label: t("admin.overview.charts.examinations") }]} />
          )}
        </ChartCard>
        <ChartCard title={t("admin.reports.submissions")} description={t("admin.reports.submissionsHint")}>
          {!subs ? <Loading /> : subs.total === 0 ? <EmptyState title={t("admin.noData")} /> : (
            <DonutChartView
              data={[
                { kind: t("admin.reports.submittedManual"), count: subs.manual },
                { kind: t("admin.reports.submittedAuto"), count: subs.auto },
                { kind: t("admin.reports.inProgress"), count: subs.inProgress },
              ].filter((d) => d.count > 0)}
              nameKey="kind"
              valueKey="count"
              centerValue={subs.total}
              centerLabel={t("admin.reports.attemptsLabel")}
            />
          )}
        </ChartCard>
        <ChartCard title={t("admin.reports.scoreDistribution")} description={t("admin.reports.scoreDistributionHint")}>
          {!dashboard.data ? <Loading /> : !hasScores(dashboard.data.scoreDistribution) ? (
            <EmptyState title={t("admin.overview.charts.noScores")} description={t("admin.overview.charts.noScoresHint")} />
          ) : (
            <BarChartView data={dashboard.data.scoreDistribution.map((b) => ({ band: bandLabel(b), count: b.count }))} xKey="band" series={[{ key: "count", label: t("dashboard.charts.students") }]} />
          )}
        </ChartCard>
        <ChartCard title={t("admin.overview.charts.avgByCourse")} description={t("admin.overview.charts.avgByCourseHint")}>
          {!dashboard.data ? <Loading /> : (() => {
            const rows = dashboard.data.averageScoreByCourse.filter((c) => c.averagePercent !== null).map((c) => ({ course: c.code, average: c.averagePercent! }));
            return rows.length === 0 ? <EmptyState title={t("admin.overview.charts.noScores")} description={t("admin.overview.charts.noScoresHint")} /> : (
              <HorizontalBarChartView data={rows} yKey="course" domainMax={100} valueSuffix="%" series={[{ key: "average", label: t("admin.overview.charts.averagePercent"), color: "var(--chart-2)" }]} />
            );
          })()}
        </ChartCard>
        {isAdmin && (<>
        <ChartCard title={t("admin.reports.payments")} description={t("admin.reports.paymentsHint")}>
          {!dashboard.data ? <Loading /> : payments.length === 0 ? <EmptyState title={t("admin.noData")} /> : (
            <DonutChartView data={payments} nameKey="provider" valueKey="count" centerValue={payments.reduce((s, p) => s + p.count, 0)} />
          )}
        </ChartCard>
        <ChartCard title={t("admin.reports.sms")} description={t("admin.reports.smsHint")}>
          {!dashboard.data ? <Loading /> : !dashboard.data.smsByStatus?.length ? <EmptyState title={t("admin.noData")} /> : (
            <BarChartView data={dashboard.data.smsByStatus.map((s) => ({ status: s.status, count: s.count }))} xKey="status" series={[{ key: "count", label: t("admin.reports.count"), color: "var(--chart-3)" }]} />
          )}
        </ChartCard>
        </>)}
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={t("admin.reports.participation")} description={t("admin.reports.participationHint")} className="pb-4" />
        {!part ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : part.length === 0 ? (
          <EmptyState title={t("admin.reports.participationEmpty")} />
        ) : (
          <DataTable columns={partColumns} rows={part} rowKey={(r) => r.exam.id} caption={t("admin.reports.participation")} />
        )}
      </Card>
    </div>
  );
}

/** Per-exam analytics. A lecturer can only open analytics of their own courses' exams. */
export function ExamReport({ initialExamId = "", ownCourseIds }: { initialExamId?: string; ownCourseIds?: Set<string> }) {
  const { t, locale } = useI18n();
  const all = useApi<{ items: ExamListItem[] }>(paths.exams({ status: "PUBLISHED" }));
  const items = useMemo(() => (all.data ? (ownCourseIds ? all.data.items.filter((e) => ownCourseIds.has(e.course.id)) : all.data.items) : undefined), [all.data, ownCourseIds]);
  const exams = { ...all, data: items && { items } };
  const [examId, setExamId] = useState(initialExamId);
  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t("admin.reports.chooseExam")} hint={t("admin.reports.chooseExamHint")} className="flex-1">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} value={examId} onChange={(e) => setExamId(e.target.value)} disabled={!exams.data}>
                <option value="">{t("admin.reports.chooseExam")}</option>
                {exams.data?.items.map((e) => <option key={e.id} value={e.id}>{e.course.code} · {e.title}</option>)}
              </Select>
            )}
          </Field>
          {examId && (
            <a href={apiUrl(paths.gradesCsv(examId, locale))} download className={buttonClasses("secondary")}>
              <Download className="h-4 w-4" aria-hidden /> {t("admin.exams.downloadGrades")}
            </a>
          )}
        </div>
        {exams.error && <div className="mt-3"><QueryError state={exams} className="py-4" /></div>}
      </Card>
      {examId ? <ExamAnalyticsView key={examId} examId={examId} /> : <Card><EmptyState title={t("admin.reports.chooseExam")} description={t("admin.reports.chooseExamHint")} /></Card>}
    </div>
  );
}