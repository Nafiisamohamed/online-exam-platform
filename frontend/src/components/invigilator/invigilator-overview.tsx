"use client";

/**
 * Invigilator overview. Every figure comes from the API:
 * - sessions and their states: GET /api/invigilation/sessions (assigned only);
 * - students in the sessions in session now: the server's own live summaries
 *   (GET /api/invigilation/sessions/:id/live), polled every few seconds;
 * - notifications: GET /api/notifications (own).
 */
import { AlertTriangle, Bell, CalendarCheck2, CalendarClock, CheckCircle2, CircleDashed, ListChecks, MonitorPlay, PlayCircle, WifiOff, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { useNow } from "@/hooks/use-now";
import { invigilatorPaths, loadLive } from "@/lib/api/invigilator";
import { useApi } from "@/lib/api/use-api";
import { formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import type { AppNotification } from "@/types/lecturer";
import type { InvigilatorSession, LiveView } from "@/types/invigilator";
import { byWindow, SessionCard } from "./session-list";

function Shortcut({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-raised">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="h-4 w-4" aria-hidden /></span>
      {label}
    </Link>
  );
}

/** Live lists of the given sessions, refreshed at the server's interval. */
function useOpenLive(ids: string[]) {
  const [state, setState] = useState<{ key: string; views: LiveView[] } | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    if (ids.length === 0) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const views = await Promise.all(ids.map((id) => loadLive<LiveView>(id)));
        if (alive) setState({ key, views });
        timer = setTimeout(run, Math.max(2, views[0]?.refreshSeconds ?? 5) * 1000);
      } catch {
        if (alive) timer = setTimeout(run, 8000);
      }
    };
    timer = setTimeout(run, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ids, key]);
  return ids.length === 0 ? [] : state?.key === key ? state.views : null;
}

export function InvigilatorOverview() {
  const { t, locale } = useI18n();
  const { profile } = useSession();
  const now = useNow();
  const sessions = useApi<{ items: InvigilatorSession[] }>(invigilatorPaths.sessions);
  const notifications = useApi<{ items: AppNotification[] }>(invigilatorPaths.notifications);
  const items = useMemo(() => sessions.data?.items ?? [], [sessions.data]);
  const open = useMemo(() => items.filter((s) => s.state === "OPEN").sort(byWindow), [items]);
  const upcoming = useMemo(() => items.filter((s) => s.state === "UPCOMING").sort(byWindow), [items]);
  const openIds = useMemo(() => open.map((s) => s.id), [open]);
  const views = useOpenLive(openIds);
  const sum = (pick: (v: LiveView) => number) => (views ? views.reduce((n, v) => n + pick(v), 0) : undefined);
  const loaded = !!sessions.data;
  const v = (n: number | undefined) => (n === undefined ? "…" : n);
  const attention = (views ?? []).flatMap((view) => view.students.filter((s) => s.status === "DISCONNECTED" || (s.focusWarning && s.status === "IN_PROGRESS")).map((s) => ({ view, s })));

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><Badge tone="sky">{t("roles.INVIGILATOR")}</Badge><Badge tone="success" dot>{t("admin.liveData")}</Badge></span>}
        title={t("dashboard.greeting", { name: profile.fullName.split(" ")[0] })}
        description={t("invigilator.overview.subtitle")}
      />
      {sessions.error && !sessions.data && <Card className="mb-6"><QueryError state={sessions} className="py-8" /></Card>}

      <section aria-label={t("admin.liveData")} className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <StatCard emphasis label={t("invigilator.overview.stats.sessions")} value={loaded ? items.length : "…"} icon={ListChecks} />
        <StatCard label={t("invigilator.overview.stats.active")} value={loaded ? open.length : "…"} icon={MonitorPlay} />
        <StatCard label={t("invigilator.overview.stats.upcoming")} value={loaded ? upcoming.length : "…"} icon={CalendarClock} />
        <StatCard label={t("invigilator.overview.stats.completed")} value={loaded ? items.filter((s) => s.state === "CLOSED").length : "…"} icon={CalendarCheck2} />
      </section>
      <p className="mb-2 text-xs text-muted">{t("invigilator.overview.liveHint")}</p>
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <StatCard label={t("invigilator.overview.stats.inProgress")} value={loaded ? v(sum((x) => x.summary.inProgress)) : "…"} icon={PlayCircle} />
        <StatCard label={t("invigilator.overview.stats.notStarted")} value={loaded ? v(sum((x) => x.summary.notStarted)) : "…"} icon={CircleDashed} />
        <StatCard label={t("invigilator.overview.stats.submitted")} value={loaded ? v(sum((x) => x.summary.submitted)) : "…"} icon={CheckCircle2} />
        <StatCard label={t("invigilator.overview.stats.disconnected")} value={loaded ? v(sum((x) => x.summary.disconnected)) : "…"} icon={WifiOff} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader title={t("invigilator.overview.activeTitle")} action={<Link href="/invigilator/sessions" className="text-sm font-semibold text-accent-strong hover:underline">{t("common.seeAll")}</Link>} />
          <CardContent className="pt-4">
            {!loaded ? <Skeleton className="h-32 w-full" /> : open.length === 0 ? (
              <EmptyState icon={MonitorPlay} title={t("invigilator.overview.activeEmpty")} className="py-8" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">{open.map((s) => <SessionCard key={s.id} session={s} />)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("admin.overview.shortcutsTitle")} />
          <CardContent className="grid gap-2 pt-4">
            <Shortcut href="/invigilator/sessions" icon={ListChecks} label={t("invigilator.overview.shortcuts.sessions")} />
            <Shortcut href="/invigilator/live" icon={MonitorPlay} label={t("invigilator.overview.shortcuts.live")} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader title={t("invigilator.overview.attention")} />
          <CardContent className="pt-2">
            {views === null ? <Skeleton className="h-24 w-full" /> : attention.length === 0 ? (
              <EmptyState icon={CheckCircle2} title={t("invigilator.overview.attentionEmpty")} className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {attention.map(({ view, s }) => (
                  <li key={`${view.schedule.id}-${s.student.id}`}>
                    <Link href={`/invigilator/sessions/${view.schedule.id}`} className="flex items-center justify-between gap-2 py-3 hover:text-accent-strong">
                      <span className="min-w-0"><span className="block truncate font-semibold text-foreground">{s.student.fullName}</span><span className="block truncate text-xs text-muted">{view.schedule.exam.title}</span></span>
                      <Badge tone="warning">{s.status === "DISCONNECTED" ? <WifiOff className="h-3 w-3" aria-hidden /> : <AlertTriangle className="h-3 w-3" aria-hidden />}{s.status === "DISCONNECTED" ? t("invigilator.status.DISCONNECTED") : t("invigilator.monitor.warning")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("invigilator.overview.upcomingTitle")} />
          <CardContent className="pt-4">
            {!loaded ? <Skeleton className="h-24 w-full" /> : upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t("invigilator.overview.upcomingEmpty")} className="py-8" />
            ) : (
              <div className="space-y-3">{upcoming.slice(0, 3).map((s) => <SessionCard key={s.id} session={s} />)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("invigilator.overview.notifications")} />
          <CardContent className="pt-2">
            {!notifications.data ? <Skeleton className="h-24 w-full" /> : notifications.data.items.length === 0 ? (
              <EmptyState icon={Bell} title={t("invigilator.overview.notificationsEmpty")} className="py-8" />
            ) : (
              <ul className="space-y-3">
                {notifications.data.items.slice(0, 5).map((n) => (
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
