"use client";

/**
 * Lecturer overview. Every figure comes from the API, scoped to the lecturer by the server:
 * - courses and enrolled students: GET /api/courses (activeStudents);
 * - examinations, upcoming and completed: GET /api/exams (own courses);
 * - pending grading: the "remaining" count of GET /api/exams/:id/grading for
 *   each published exam with attempts (own and second-graded);
 * - average score by course: GET /api/analytics/dashboard;
 * - recent activity: the lecturer's own notifications (the audit log is registrar-only).
 */
import { Award, BarChart3, BookOpenCheck, CalendarCheck2, CalendarClock, ClipboardCheck, FilePlus2, FileUp, GraduationCap, NotebookPen, Plus, RefreshCw, Bell, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HorizontalBarChartView, BarChartView } from "@/components/charts/charts";
import { ChartCard } from "@/components/charts/chart-card";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { useNow } from "@/hooks/use-now";
import { EXAM_STATES } from "@/lib/admin/exam-state";
import { examStageCounts, upcomingExams } from "@/lib/admin/report-data";
import { api } from "@/lib/api/client";
import { lecturerPaths } from "@/lib/api/lecturer";
import { invalidate, useApi } from "@/lib/api/use-api";
import { formatRelative, formatDate, formatTimeRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import type { AdminDashboard, ExamListItem } from "@/types/admin";
import type { AppNotification, GradingQueue } from "@/types/lecturer";
import { useMyCourses } from "./course-picker";
import { GradingList, gradable } from "./grading-list";

function Shortcut({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-raised">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {label}
    </Link>
  );
}

/** Sum of the server's remaining counts; null until every queue has answered. */
function usePendingGrading(exams: ExamListItem[] | undefined) {
  const ids = useMemo(() => (exams ? gradable(exams).map((e) => e.id) : null), [exams]);
  const [total, setTotal] = useState<{ key: string; value: number | null } | null>(null);
  const key = ids?.join(",") ?? "";
  useEffect(() => {
    if (!ids) return;
    let live = true;
    Promise.all(ids.map((id) => api<GradingQueue>(lecturerPaths.grading(id)).then((q) => q.remaining)))
      .then((counts) => live && setTotal({ key, value: counts.reduce((s, n) => s + n, 0) }))
      .catch(() => live && setTotal({ key, value: null }));
    return () => {
      live = false;
    };
  }, [ids, key]);
  return total?.key === key ? total.value : undefined;
}

export function LecturerOverview() {
  const { t, locale } = useI18n();
  const { profile } = useSession();
  const now = useNow();
  const courses = useMyCourses();
  const exams = useApi<{ items: ExamListItem[] }>(lecturerPaths.exams());
  const dashboard = useApi<AdminDashboard>(lecturerPaths.dashboard);
  const notifications = useApi<{ items: AppNotification[] }>(lecturerPaths.notifications);
  const courseIds = useMemo(() => new Set(courses.data?.items.map((c) => c.id)), [courses.data]);
  const own = useMemo(() => (exams.data && courses.data ? exams.data.items.filter((e) => courseIds.has(e.course.id)) : undefined), [exams.data, courses.data, courseIds]);
  const stages = useMemo(() => (own ? examStageCounts(own, now) : null), [own, now]);
  const upcoming = useMemo(() => (own ? upcomingExams(own, now) : []), [own, now]);
  const pending = usePendingGrading(exams.data?.items);
  const students = courses.data?.items.reduce((s, c) => s + c.activeStudents, 0);
  const averages = (dashboard.data?.averageScoreByCourse ?? []).filter((c) => c.averagePercent !== null).map((c) => ({ course: c.code, average: c.averagePercent! }));
  const failed = [courses, exams, dashboard].find((q) => q.error && q.data === undefined);
  const v = (n: number | null | undefined, loaded: boolean) => (loaded ? (n ?? "—") : "…");
  const firstName = profile.fullName.replace(/^(Dr|Prof)\.?\s+/i, "").split(" ")[0];
  const refresh = () => invalidate("/courses", "/exams", "/analytics/dashboard", "/notifications");

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><Badge tone="sky">{t("roles.LECTURER")}</Badge><Badge tone="success" dot>{t("admin.liveData")}</Badge></span>}
        title={t("dashboard.greeting", { name: firstName })}
        description={t("lecturer.overview.subtitle")}
        actions={<Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={refresh}>{t("admin.refresh")}</Button>}
      />
      {failed && <Card className="mb-6"><QueryError state={failed} className="py-8" /></Card>}

      <section aria-label={t("admin.liveData")} className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        <StatCard emphasis label={t("lecturer.overview.stats.courses")} value={v(courses.data?.items.length, !!courses.data)} icon={BookOpenCheck} />
        <StatCard label={t("lecturer.overview.stats.students")} value={v(students, !!courses.data)} icon={GraduationCap} hint={t("lecturer.overview.stats.studentsHint")} />
        <StatCard label={t("lecturer.overview.stats.exams")} value={v(own?.length, !!own)} icon={NotebookPen} hint={t("lecturer.overview.stats.examsHint")} />
        <StatCard label={t("lecturer.overview.stats.upcoming")} value={v(stages?.UPCOMING, !!stages)} icon={CalendarClock} hint={t("lecturer.overview.stats.upcomingHint")} />
        <StatCard label={t("lecturer.overview.stats.completed")} value={v(stages?.COMPLETED, !!stages)} icon={CalendarCheck2} hint={t("lecturer.overview.stats.completedHint")} />
        <StatCard label={t("lecturer.overview.stats.pending")} value={pending === undefined ? "…" : (pending ?? "—")} icon={ClipboardCheck} hint={t("lecturer.overview.stats.pendingHint")} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <ChartCard className="xl:col-span-2" title={t("admin.overview.charts.avgByCourse")} description={t("admin.overview.charts.avgByCourseHint")}>
          {!dashboard.data ? <Skeleton className="h-full w-full" /> : averages.length === 0 ? (
            <EmptyState icon={BarChart3} title={t("admin.overview.charts.noScores")} description={t("admin.overview.charts.noScoresHint")} />
          ) : (
            <HorizontalBarChartView data={averages} yKey="course" domainMax={100} valueSuffix="%" series={[{ key: "average", label: t("admin.overview.charts.averagePercent"), color: "var(--chart-2)" }]} />
          )}
        </ChartCard>
        <Card>
          <CardHeader title={t("admin.overview.shortcutsTitle")} />
          <CardContent className="grid gap-2 pt-4">
            <Shortcut href="/lecturer/questions" icon={Plus} label={t("lecturer.overview.shortcuts.newQuestion")} />
            <Shortcut href="/lecturer/questions" icon={FileUp} label={t("lecturer.overview.shortcuts.importQuestions")} />
            <Shortcut href="/lecturer/exams/new" icon={FilePlus2} label={t("lecturer.overview.shortcuts.newExam")} />
            <Shortcut href="/lecturer/grading" icon={ClipboardCheck} label={t("lecturer.overview.shortcuts.grading")} />
            <Shortcut href="/lecturer/results" icon={Award} label={t("lecturer.overview.shortcuts.results")} />
          </CardContent>
        </Card>
        <ChartCard className="xl:col-span-3" title={t("admin.overview.charts.examsByState")} description={t("admin.overview.charts.examsByStateHint")} height={240}>
          {!stages ? <Skeleton className="h-full w-full" /> : (
            <BarChartView data={EXAM_STATES.map((s) => ({ stage: t(`admin.exams.states.${s}`), count: stages[s] }))} xKey="stage" series={[{ key: "count", label: t("admin.overview.charts.examinations") }]} />
          )}
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader title={t("lecturer.overview.gradingTitle")} action={<Link href="/lecturer/grading" className="text-sm font-semibold text-accent-strong hover:underline">{t("common.seeAll")}</Link>} />
          <CardContent className="pt-2">{exams.data ? <GradingList exams={exams.data.items} limit={5} /> : <Skeleton className="h-32 w-full" />}</CardContent>
        </Card>
        <Card>
          <CardHeader title={t("lecturer.overview.upcomingTitle")} />
          <CardContent className="pt-2">
            {!own ? <Skeleton className="h-32 w-full" /> : upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t("lecturer.overview.upcomingEmpty")} className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map(({ exam, schedule }) => (
                  <li key={exam.id}>
                    <Link href={`/lecturer/exams/${exam.id}`} className="block py-3 hover:text-accent-strong">
                      <span className="block truncate font-semibold text-foreground">{exam.title}</span>
                      <span className="block text-xs text-muted">{exam.course.code} · {formatDate(schedule.windowStart, locale)} · {formatTimeRange(schedule.windowStart, schedule.windowEnd, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("lecturer.overview.activityTitle")} />
          <CardContent className="pt-2">
            {!notifications.data ? <Skeleton className="h-32 w-full" /> : notifications.data.items.length === 0 ? (
              <EmptyState icon={Bell} title={t("lecturer.overview.activityEmpty")} className="py-8" />
            ) : (
              <ul className="space-y-3">
                {notifications.data.items.slice(0, 6).map((n) => (
                  <li key={n.id} className="text-sm">
                    <span className="block font-semibold text-foreground">{n.title}</span>
                    <span className="block text-muted">{n.body}</span>
                    <span className="text-xs text-subtle">{now ? formatRelative(n.createdAt, now, locale) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
