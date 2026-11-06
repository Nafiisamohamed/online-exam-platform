"use client";

/**
 * Student overview. Every figure comes from the student's own data:
 * - courses: GET /api/courses (active enrolments only);
 * - upcoming / open / submitted exams: GET /api/my/exams (the server's own states);
 * - published results: GET /api/my/results (unpublished results never appear);
 * - notifications: GET /api/notifications (own, translated by the server).
 */
import { Award, BookOpenCheck, CalendarClock, CheckCheck, CheckCircle2, CreditCard, PlayCircle, ScrollText, Bell, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { useNow } from "@/hooks/use-now";
import { useServerNow } from "@/hooks/use-server-now";
import { api } from "@/lib/api/client";
import { studentPaths } from "@/lib/api/student";
import { invalidate, useApi } from "@/lib/api/use-api";
import { formatDate, formatPercent, formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import { groupMyExams } from "@/lib/student/my-exams";
import type { Course } from "@/types/admin";
import type { AppNotification } from "@/types/lecturer";
import type { MyExam, MyResultItem } from "@/types/student";
import { ExamCard } from "./exam-card";

function Shortcut({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-raised">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="h-4 w-4" aria-hidden /></span>
      {label}
    </Link>
  );
}

export function StudentOverview() {
  const { t, locale } = useI18n();
  const { profile } = useSession();
  const now = useNow();
  const serverNow = useServerNow();
  const courses = useApi<{ items: Course[] }>(studentPaths.courses);
  const exams = useApi<{ items: MyExam[] }>(studentPaths.myExams);
  const results = useApi<{ items: MyResultItem[] }>(studentPaths.results);
  const notifications = useApi<{ items: AppNotification[] }>(studentPaths.notifications);
  const g = exams.data ? groupMyExams(exams.data.items) : null;
  const failed = [courses, exams, results].find((q) => q.error && q.data === undefined);
  const v = (n: number | undefined) => (n === undefined ? "…" : n);
  const unread = notifications.data?.items.filter((n) => !n.readAt).length ?? 0;
  const markAll = async () => {
    await api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
    invalidate("/notifications");
  };

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><Badge tone="sky">{t("roles.STUDENT")}</Badge><Badge tone="success" dot>{t("admin.liveData")}</Badge></span>}
        title={t("dashboard.greeting", { name: profile.fullName.split(" ")[0] })}
        description={t("student.overview.subtitle")}
      />
      {failed && <Card className="mb-6"><QueryError state={failed} className="py-8" /></Card>}

      <section aria-label={t("admin.liveData")} className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5 [&>*]:min-w-0">
        <StatCard emphasis label={t("student.overview.stats.courses")} value={v(courses.data?.items.length)} icon={BookOpenCheck} />
        <StatCard label={t("student.overview.stats.upcoming")} value={v(g?.upcoming.length)} icon={CalendarClock} />
        <StatCard label={t("student.overview.stats.active")} value={v(g?.active.length)} icon={PlayCircle} />
        <StatCard label={t("student.overview.stats.completed")} value={v(exams.data?.items.filter((e) => e.state === "SUBMITTED").length)} icon={CheckCircle2} />
        <StatCard label={t("student.overview.stats.results")} value={v(results.data?.items.length)} icon={Award} />
      </section>

      {g && g.active.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-base font-semibold text-foreground">{t("student.overview.activeTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">{g.active.map((e) => <ExamCard key={e.id} exam={e} serverNow={serverNow} />)}</div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader title={t("student.overview.nextExams")} action={<Link href="/student/exams" className="text-sm font-semibold text-accent-strong hover:underline">{t("common.seeAll")}</Link>} />
          <CardContent className="pt-4">
            {!g ? <Skeleton className="h-40 w-full" /> : g.upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t("student.overview.nextEmpty")} className="py-8" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">{g.upcoming.slice(0, 4).map((e) => <ExamCard key={e.id} exam={e} serverNow={serverNow} />)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("admin.overview.shortcutsTitle")} />
          <CardContent className="grid gap-2 pt-4">
            <Shortcut href="/student/exams" icon={ScrollText} label={t("student.overview.shortcuts.exams")} />
            <Shortcut href="/student/results" icon={Award} label={t("student.overview.shortcuts.results")} />
            <Shortcut href="/student/courses" icon={BookOpenCheck} label={t("student.overview.shortcuts.courses")} />
            <Shortcut href="/student/payments" icon={CreditCard} label={t("student.overview.shortcuts.payments")} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title={t("student.overview.recentResults")} action={<Link href="/student/results" className="text-sm font-semibold text-accent-strong hover:underline">{t("common.seeAll")}</Link>} />
          <CardContent className="pt-2">
            {!results.data ? <Skeleton className="h-32 w-full" /> : results.data.items.length === 0 ? (
              <EmptyState icon={Award} title={t("student.overview.resultsEmpty")} className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {[...results.data.items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5).map((r) => (
                  <li key={r.examId}>
                    <Link href={`/student/results/${r.examId}`} className="flex items-center justify-between gap-3 py-3 hover:text-accent-strong">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-foreground">{r.exam.title}</span>
                        <span className="block text-xs text-muted">{r.exam.course.code} · {formatDate(r.publishedAt, locale)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums">{formatPercent(r.percentage, locale)}{r.letterGrade && <Badge tone="navy">{r.letterGrade}</Badge>}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title={t("student.overview.notifications")}
            action={unread > 0 ? <Button variant="ghost" size="sm" leftIcon={<CheckCheck className="h-3.5 w-3.5" />} onClick={markAll}>{t("student.overview.markAllRead")}</Button> : undefined}
          />
          <CardContent className="pt-2">
            {!notifications.data ? <Skeleton className="h-32 w-full" /> : notifications.data.items.length === 0 ? (
              <EmptyState icon={Bell} title={t("student.overview.notificationsEmpty")} className="py-8" />
            ) : (
              <ul className="space-y-3">
                {notifications.data.items.slice(0, 6).map((n) => (
                  <li key={n.id} className="flex gap-3 text-sm">
                    <span className={n.readAt ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"} aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">{n.title}</span>
                      <span className="block text-muted">{n.body}</span>
                      <span className="text-xs text-subtle">{now ? formatRelative(n.createdAt, now, locale) : ""}</span>
                    </span>
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
