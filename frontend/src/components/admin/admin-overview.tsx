"use client";

/**
 * Registrar overview. Every figure comes from the API:
 * - accounts per role: GET /api/analytics/dashboard (usersByRole);
 * - faculties, courses: GET /api/faculties, GET /api/courses;
 * - examinations, upcoming and completed: GET /api/exams (stage from the exam's own schedule);
 * - average score by course: GET /api/analytics/dashboard;
 * - recent activity: GET /api/audit-logs.
 * A figure the API did not send is shown as "—", never as a made-up number.
 */
import {
  BarChart3, BookOpenCheck, Building2, CalendarCheck2, CalendarClock, ClipboardCheck, Eye, FileUp, GraduationCap, NotebookPen, Plus,
  RefreshCw, ShieldCheck, UserPlus, Users, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { BarChartView, DonutChartView, HorizontalBarChartView } from "@/components/charts/charts";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { useNow } from "@/hooks/use-now";
import { EXAM_STATES } from "@/lib/admin/exam-state";
import { accountsWithRole, examStageCounts, upcomingExams } from "@/lib/admin/report-data";
import { paths } from "@/lib/api/admin";
import { invalidate, useApi } from "@/lib/api/use-api";
import { CAMPUS_TIME_ZONE, formatDate, formatRelative, formatTimeRange } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/i18n/i18n";
import { adminEn } from "@/lib/i18n/messages/admin.en";
import { useSession } from "@/lib/session/session";
import type { AdminDashboard, AuditEntry, Course, ExamListItem, Faculty, Paged } from "@/types/admin";
import { ROLES } from "@/types/account";
import { QueryError } from "./query-state";

const show = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n);

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

function RecentActivity() {
  const { t, locale } = useI18n();
  const now = useNow();
  const logs = useApi<Paged<AuditEntry>>(paths.auditLogs({ pageSize: 8 }));
  // Unknown (newer) codes are shown readably: "SOME_ACTION" -> "some action".
  const actionText = (code: string) => (Object.hasOwn(adminEn.audit.actions, code) ? t(`admin.audit.actions.${code}` as MessageKey) : code.toLowerCase().replaceAll("_", " "));
  return (
    <Card className="flex flex-col">
      <CardHeader title={t("admin.overview.activityTitle")} />
      <CardContent className="flex-1 pt-3">
        {logs.error && !logs.data ? (
          <QueryError state={logs} className="py-6" />
        ) : !logs.data ? (
          <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : logs.data.items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t("admin.overview.activityEmpty")} className="py-8" />
        ) : (
          <ul className="space-y-1">
            {logs.data.items.map((e) => (
              <li key={e.id} className="flex items-start gap-3 rounded-lg px-1 py-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                <p className="min-w-0 flex-1 text-sm text-text">
                  <span className="font-semibold text-foreground">{e.actor?.fullName ?? t("admin.audit.system")}</span> {actionText(e.actionCode)}
                </p>
                <time dateTime={e.createdAt} className="shrink-0 text-xs text-subtle" title={formatDate(e.createdAt, locale)}>
                  {now ? formatRelative(e.createdAt, now, locale) : ""}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminOverview() {
  const { t, locale } = useI18n();
  const { profile } = useSession();
  const now = useNow();
  const dashboard = useApi<AdminDashboard>(paths.dashboard);
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const courses = useApi<{ items: Course[] }>(paths.courses());
  const exams = useApi<{ items: ExamListItem[] }>(paths.exams());

  const stages = useMemo(() => (exams.data ? examStageCounts(exams.data.items, now) : null), [exams.data, now]);
  const upcoming = useMemo(() => (exams.data ? upcomingExams(exams.data.items, now) : []), [exams.data, now]);
  const courseMap = useMemo(() => new Map((courses.data?.items ?? []).map((c) => [c.id, c])), [courses.data]);
  const roleData = useMemo(
    () => ROLES.map((r) => ({ role: t(`roles.${r}`), count: accountsWithRole(dashboard.data, r) ?? 0 })).filter((r) => r.count > 0),
    [dashboard.data, t],
  );
  const averages = useMemo(
    () => (dashboard.data?.averageScoreByCourse ?? []).filter((c) => c.averagePercent !== null).map((c) => ({ course: c.code, average: c.averagePercent! })),
    [dashboard.data],
  );
  const firstName = profile.fullName.split(" ")[0];
  const v = (n: number | null | undefined, loaded: boolean) => (loaded ? show(n) : "…");
  const failed = [dashboard, faculties, courses, exams].find((q) => q.error && q.data === undefined);

  const refresh = () => invalidate(paths.dashboard, paths.faculties, "/courses", "/exams", "/audit-logs");

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><Badge tone="sky">{t("roles.ADMIN")}</Badge><Badge tone="success" dot>{t("admin.liveData")}</Badge></span>}
        title={t("dashboard.greeting", { name: firstName })}
        description={t("admin.overview.subtitle")}
        actions={<Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={refresh}>{t("admin.refresh")}</Button>}
      />

      {failed && <Card className="mb-6"><QueryError state={failed} className="py-8" /></Card>}

      <section aria-label={t("admin.liveData")} className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard emphasis label={t("admin.overview.stats.students")} value={v(accountsWithRole(dashboard.data, "STUDENT"), !!dashboard.data)} icon={GraduationCap} hint={t("admin.overview.stats.accountsHint")} />
        <StatCard label={t("admin.overview.stats.lecturers")} value={v(accountsWithRole(dashboard.data, "LECTURER"), !!dashboard.data)} icon={Users} hint={t("admin.overview.stats.accountsHint")} />
        <StatCard label={t("admin.overview.stats.invigilators")} value={v(accountsWithRole(dashboard.data, "INVIGILATOR"), !!dashboard.data)} icon={Eye} hint={t("admin.overview.stats.accountsHint")} />
        <StatCard label={t("admin.overview.stats.faculties")} value={v(faculties.data?.items.length, !!faculties.data)} icon={Building2} />
        <StatCard label={t("admin.overview.stats.courses")} value={v(courses.data?.items.length, !!courses.data)} icon={BookOpenCheck} />
        <StatCard label={t("admin.overview.stats.exams")} value={v(exams.data?.items.length, !!exams.data)} icon={NotebookPen} hint={stages ? `${t("admin.overview.stats.awaitingApproval")}: ${stages.AWAITING_APPROVAL}` : undefined} />
        <StatCard label={t("admin.overview.stats.upcoming")} value={v(stages?.UPCOMING, !!stages)} icon={CalendarClock} hint={t("admin.overview.stats.upcomingHint")} />
        <StatCard label={t("admin.overview.stats.completed")} value={v(stages?.COMPLETED, !!stages)} icon={CalendarCheck2} hint={t("admin.overview.stats.completedHint")} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard title={t("admin.overview.charts.usersByRole")} description={t("admin.overview.charts.usersByRoleHint")}>
          {!dashboard.data ? <Skeleton className="h-full w-full" /> : roleData.length === 0 ? <EmptyState title={t("admin.noData")} /> : (
            <DonutChartView data={roleData} nameKey="role" valueKey="count" centerValue={roleData.reduce((s, r) => s + r.count, 0)} centerLabel={t("admin.overview.charts.accounts")} />
          )}
        </ChartCard>
        <ChartCard className="xl:col-span-2" title={t("admin.overview.charts.examsByState")} description={t("admin.overview.charts.examsByStateHint")}>
          {!stages ? <Skeleton className="h-full w-full" /> : (
            <BarChartView data={EXAM_STATES.map((s) => ({ stage: t(`admin.exams.states.${s}`), count: stages[s] }))} xKey="stage" series={[{ key: "count", label: t("admin.overview.charts.examinations") }]} />
          )}
        </ChartCard>
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
            <Shortcut href="/admin/users" icon={UserPlus} label={t("admin.overview.shortcuts.addUser")} />
            <Shortcut href="/admin/courses" icon={Plus} label={t("admin.overview.shortcuts.addCourse")} />
            <Shortcut href="/admin/enrolment" icon={FileUp} label={t("admin.overview.shortcuts.importEnrolments")} />
            <Shortcut href="/admin/exams" icon={ClipboardCheck} label={t("admin.overview.shortcuts.reviewExams")} />
            <Shortcut href="/admin/reports" icon={BarChart3} label={t("admin.overview.shortcuts.openReports")} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader title={t("admin.overview.upcomingTitle")} action={<Link href="/admin/exams" className="text-sm font-semibold text-accent-strong hover:underline">{t("common.seeAll")}</Link>} />
          <CardContent className="flex-1 pt-3">
            {!exams.data ? (
              <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t("admin.overview.upcomingEmpty")} description={t("admin.overview.upcomingEmptyHint")} className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map(({ exam, schedule }) => (
                  <li key={exam.id}>
                    <Link href={`/admin/exams/${exam.id}`} className="flex items-center gap-4 py-3 hover:text-accent-strong">
                      <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-accent-soft py-1.5 text-accent-strong">
                        <span className="text-[11px] font-semibold uppercase">{new Intl.DateTimeFormat(locale === "so" ? "so-SO" : "en-GB", { month: "short", timeZone: CAMPUS_TIME_ZONE }).format(new Date(schedule.windowStart))}</span>
                        <span className="text-lg leading-none font-bold">{new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: CAMPUS_TIME_ZONE }).format(new Date(schedule.windowStart))}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-foreground">{exam.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {exam.course.code} · {formatTimeRange(schedule.windowStart, schedule.windowEnd, locale)} · {t("admin.minutes", { count: schedule.durationMinutes })}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted">
                        <span className="block font-semibold text-foreground tabular-nums">{courseMap.get(exam.course.id)?.activeStudents ?? "—"}</span>
                        {t("admin.exams.enrolled")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <RecentActivity />
      </div>
    </>
  );
}
