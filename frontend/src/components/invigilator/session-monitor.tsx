"use client";

/**
 * The live monitoring screen of one session. Every status comes from the
 * server's live list (GET /api/invigilation/sessions/:id/live, polled at the
 * server's own interval); the screen only filters, sorts and counts the
 * time-left figures forward between polls. Problem rows (disconnected, or
 * with a warning) come first so they are noticed quickly.
 */
import { AlertTriangle, CheckCircle2, CircleDashed, PlayCircle, Users, WifiOff } from "lucide-react";
import { use, useMemo, useState } from "react";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { useServerNow } from "@/hooks/use-server-now";
import { invigilatorPaths } from "@/lib/api/invigilator";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime, formatTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { formatClock } from "@/lib/student/exam-clock";
import { LIVE_STATUSES, type InvigilatorNote, type InvigilatorSession, type LiveStatus, type LiveStudent, type SessionState } from "@/types/invigilator";
import { ExtensionDialog } from "./extension-dialog";
import { NoteDialog, NotesCard } from "./notes-panel";
import { SessionStateBadge, LiveStatusBadge } from "./status-badge";
import { StudentDialog } from "./student-dialog";
import { useLive } from "./use-live";

/** Rows that need attention sort first: disconnected, then warned, then the rest by student number. */
const attentionRank = (s: LiveStudent) => (s.status === "DISCONNECTED" ? 0 : s.focusWarning && s.status === "IN_PROGRESS" ? 1 : 2);

function MonitorBody({ sessionId }: { sessionId: string }) {
  const { t, locale } = useI18n();
  const live = useLive(sessionId);
  const sessions = useApi<{ items: InvigilatorSession[] }>(invigilatorPaths.sessions);
  const notes = useApi<{ items: InvigilatorNote[] }>(invigilatorPaths.notes(sessionId));
  const serverNow = useServerNow();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LiveStatus | "">("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"time" | "note" | null>(null);

  const data = live.data;
  const session = sessions.data?.items.find((s) => s.id === sessionId);
  const sessionState: SessionState | null =
    data && serverNow !== null ? (serverNow < new Date(data.schedule.windowStart).getTime() ? "UPCOMING" : serverNow < new Date(data.schedule.windowEnd).getTime() ? "OPEN" : "CLOSED") : (session?.state ?? null);
  // Time-left figures count forward from the last poll (the server restates them at every poll).
  const sinceUpdate = live.sinceUpdate;
  const remaining = (s: LiveStudent) => Math.max(0, (s.remainingSeconds ?? 0) - sinceUpdate);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.students ?? [])
      .filter((s) => (!status || s.status === status) && (!q || s.student.fullName.toLowerCase().includes(q) || (s.student.studentNumber ?? "").toLowerCase().includes(q)))
      .sort((a, b) => attentionRank(a) - attentionRank(b) || (a.student.studentNumber ?? "").localeCompare(b.student.studentNumber ?? ""));
  }, [data, search, status]);
  const open = data?.students.find((s) => s.student.id === openId) ?? null;

  if (live.error && !data) {
    return <Card className="mt-4"><QueryError state={{ error: live.error, reload: live.refresh }} /></Card>;
  }
  if (!data) return <div className="space-y-4" aria-busy><Skeleton className="h-10 w-72" /><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div>;

  const sm = data.summary;
  const started = sm.inProgress + sm.disconnected + sm.submitted;
  const exam = data.schedule.exam;

  const columns: Column<LiveStudent>[] = [
    {
      key: "student",
      header: t("invigilator.monitor.columns.student"),
      primary: true,
      cell: (s) => (
        <button type="button" onClick={() => setOpenId(s.student.id)} className="group block min-w-0 text-left">
          <span className="block font-semibold text-foreground group-hover:text-accent-strong">{s.student.fullName}</span>
          <span className="block text-xs text-muted">{s.student.studentNumber}{s.notes > 0 ? ` · ${s.notes} ✎` : ""}</span>
        </button>
      ),
    },
    {
      key: "status",
      header: t("invigilator.monitor.columns.status"),
      cell: (s) => (
        <span className="flex flex-col items-end gap-1 md:items-start">
          <LiveStatusBadge status={s.status} />
          {s.awayFromTabSeconds != null && <span className="text-xs font-medium text-warning">{t("invigilator.monitor.away", { seconds: s.awayFromTabSeconds + sinceUpdate })}</span>}
        </span>
      ),
    },
    { key: "started", header: t("invigilator.monitor.columns.started"), cell: (s) => <span className="whitespace-nowrap tabular-nums">{s.startedAt ? formatTime(s.startedAt, locale) : t("invigilator.monitor.notYet")}</span>, className: "hidden xl:table-cell" },
    {
      key: "remaining",
      header: t("invigilator.monitor.columns.remaining"),
      align: "right",
      cell: (s) => (s.status === "IN_PROGRESS" || s.status === "DISCONNECTED" ? <span className="font-mono font-semibold tabular-nums">{formatClock(remaining(s))}{(s.extensionMinutes ?? 0) > 0 ? ` (+${s.extensionMinutes})` : ""}</span> : t("invigilator.monitor.notYet")),
    },
    { key: "progress", header: t("invigilator.monitor.columns.progress"), align: "right", cell: (s) => (s.attemptId ? <span className="tabular-nums">{s.answeredCount} / {s.totalQuestions}</span> : t("invigilator.monitor.notYet")), className: "hidden lg:table-cell" },
    {
      key: "focus",
      header: t("invigilator.monitor.columns.focus"),
      align: "right",
      cell: (s) => (s.attemptId ? <Badge tone={s.focusWarning ? "warning" : "neutral"}>{s.focusWarning && <AlertTriangle className="h-3 w-3" aria-hidden />}{s.countedFocusLosses}</Badge> : t("invigilator.monitor.notYet")),
    },
    {
      key: "contact",
      header: t("invigilator.monitor.columns.contact"),
      cell: (s) => (s.status === "IN_PROGRESS" || s.status === "DISCONNECTED" ? <span className={s.status === "DISCONNECTED" ? "font-semibold text-warning" : "text-muted"}>{t("invigilator.monitor.ago", { seconds: (s.secondsSinceContact ?? 0) + sinceUpdate })}</span> : s.status === "SUBMITTED" ? (s.submissionType === "AUTO_DEADLINE" ? t("invigilator.monitor.auto") : t("invigilator.monitor.manual")) : t("invigilator.monitor.notYet")),
      className: "hidden lg:table-cell",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.sessions"), href: "/invigilator/sessions" }, { label: exam.title }]} />}
        title={exam.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {sessionState && <SessionStateBadge state={sessionState} />}
            <span className="text-sm text-muted">{exam.course.code} · {exam.course.name}</span>
            <span className="text-sm text-muted">{formatDateTime(data.schedule.windowStart, locale)} – {formatTime(data.schedule.windowEnd, locale)} · {t("invigilator.monitor.duration")}: {t("student.common.minutes", { count: data.schedule.durationMinutes })}</span>
            <span className="text-sm text-muted">{t("invigilator.monitor.rooms")}: {session?.rooms.length ? session.rooms.join(", ") : t("invigilator.monitor.noRooms")}</span>
          </span>
        }
        actions={<Button variant="outline" onClick={() => setDialog("note")}>{t("invigilator.notes.add")}</Button>}
      />

      <p role="status" className={live.error ? "mb-3 text-xs font-semibold text-warning" : "mb-3 text-xs text-muted"}>
        {live.stale ? (
          <span className="inline-flex items-center gap-1.5"><WifiOff className="h-3.5 w-3.5" aria-hidden />{t("invigilator.monitor.stale", { seconds: sinceUpdate })}</span>
        ) : (
          <>{t("invigilator.monitor.updated", { time: t("invigilator.monitor.ago", { seconds: sinceUpdate }) })} · {t("invigilator.monitor.refreshEvery", { seconds: data.refreshSeconds })} · {t("invigilator.monitor.disconnectedRule", { seconds: data.disconnectedAfterSeconds })}</>
        )}
      </p>

      <section aria-label={t("invigilator.monitor.rulesTitle")} className="mb-6 grid gap-3 sm:grid-cols-3 2xl:grid-cols-6 [&>*]:min-w-0">
        <StatCard label={t("invigilator.monitor.summary.total")} value={sm.total} icon={Users} />
        <StatCard label={t("invigilator.monitor.summary.started")} value={started} icon={PlayCircle} />
        <StatCard emphasis label={t("invigilator.monitor.summary.inProgress")} value={sm.inProgress} icon={PlayCircle} />
        <StatCard label={t("invigilator.monitor.summary.disconnected")} value={sm.disconnected} icon={WifiOff} />
        <StatCard label={t("invigilator.monitor.summary.submitted")} value={sm.submitted} icon={CheckCircle2} />
        <StatCard label={t("invigilator.monitor.summary.notStarted")} value={sm.notStarted} icon={CircleDashed} />
      </section>

      {sm.disconnected > 0 && <Alert tone="warning" className="mb-4">{t("invigilator.monitor.summary.disconnected")}: {sm.disconnected}</Alert>}

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end">
          <Field label={t("common.search")} className="flex-1">
            {({ id }) => <SearchInput id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("invigilator.monitor.search")} />}
          </Field>
          <Field label={t("admin.status")} className="sm:w-52">
            {({ id }) => (
              <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as LiveStatus | "")}>
                <option value="">{t("invigilator.monitor.allStatuses")}</option>
                {LIVE_STATUSES.map((s) => <option key={s} value={s}>{t(`invigilator.status.${s}`)}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {rows.length === 0 ? <EmptyState title={t("invigilator.monitor.noStudents")} /> : <DataTable columns={columns} rows={rows} rowKey={(s) => s.student.id} caption={t("invigilator.live.title")} />}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <NotesCard sessionId={sessionId} students={data.students} />
        <Card className="self-start">
          <div className="space-y-2.5 p-5 text-sm text-text sm:p-6">
            <h3 className="text-base font-semibold text-foreground">{t("invigilator.monitor.rulesTitle")}</h3>
            <p>{t("invigilator.monitor.rules.disconnected", { seconds: data.disconnectedAfterSeconds })}</p>
            <p>{t("invigilator.monitor.rules.focus")}</p>
            <p>{t("invigilator.monitor.rules.extension")}</p>
            <p>{t("invigilator.monitor.rules.privacy")}</p>
          </div>
        </Card>
      </div>

      {open && dialog === null && (
        <StudentDialog
          student={open}
          remaining={remaining(open)}
          canAct={sessionState !== "CLOSED"}
          notes={(notes.data?.items ?? []).filter((n) => n.studentId === open.student.id)}
          onAddTime={() => setDialog("time")}
          onAddNote={() => setDialog("note")}
          onClose={() => setOpenId(null)}
        />
      )}
      {dialog === "time" && open && open.attemptId && (
        <ExtensionDialog student={open} remainingSeconds={remaining(open)} onClose={() => setDialog(null)} onDone={() => { setDialog(null); live.refresh(); }} />
      )}
      {dialog === "note" && <NoteDialog sessionId={sessionId} students={data.students} defaultStudentId={open?.student.id} onClose={() => setDialog(null)} />}
    </>
  );
}

export function SessionMonitor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MonitorBody key={id} sessionId={id} />;
}
