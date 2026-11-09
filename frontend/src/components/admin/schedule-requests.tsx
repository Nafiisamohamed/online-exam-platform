"use client";

/**
 * Schedule requests (registrar). Lecturers request a window for an examination;
 * the registrar approves it (students are notified and may sit the exam in that
 * window) or rejects it with a reason the lecturer sees.
 *
 * Data: GET /api/schedules?status=… ; actions: POST /api/schedules/:id/approve
 * and /reject. The server allows both only to the registrar and checks every
 * rule again: the examination must be finalised (published) by its lecturer,
 * the window must still be in the future, and it must not clash with another
 * approved exam of the same students, rooms or invigilators.
 */
import { CalendarClock, CheckCircle2, Clock, DoorOpen, Eye, UserRound, XCircle } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { QueryError } from "@/components/admin/query-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import { approveSchedule, paths, rejectSchedule } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTimeRange } from "@/lib/format";
import { errorText } from "@/lib/i18n/error-text";
import { useI18n } from "@/lib/i18n/i18n";
import type { Schedule, ScheduleStatus } from "@/types/admin";

const FILTERS: ScheduleStatus[] = ["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"];
const TONE: Record<ScheduleStatus, "warning" | "success" | "danger" | "neutral"> = { REQUESTED: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" };

type Clash = { type: "STUDENT" | "ROOM" | "INVIGILATOR"; examTitle: string; count: number };

/** The server's answer to a refused decision, with the clashing exams listed. */
function DecisionError({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const clashes = error instanceof ApiError && error.code === "SCHEDULE_CONFLICT" ? (error.details?.conflicts as Clash[] | undefined) : undefined;
  return (
    <Alert tone="danger" title={errorText(t, error)}>
      {clashes?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {clashes.map((c, i) => <li key={i}>{t(`admin.schedules.clash.${c.type}`, { exam: c.examTitle, count: c.count })}</li>)}
        </ul>
      ) : null}
    </Alert>
  );
}

function Detail({ icon: Icon, label, children, wide }: { icon: typeof Clock; label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2", wide && "sm:col-span-2")}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden />
      <div className="min-w-0">
        <dt className="sr-only">{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}

function RequestCard({ s, onApprove, onReject }: { s: Schedule; onApprove: (s: Schedule) => void; onReject: (s: Schedule) => void }) {
  const { t, locale } = useI18n();
  const draft = s.exam.status !== "PUBLISHED";
  const waiting = s.status === "REQUESTED";
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[s.status]} dot>{t(`admin.exams.scheduleStatus.${s.status}`)}</Badge>
            <span className="text-sm font-medium text-muted">{s.exam.course.code} · {s.exam.course.name}</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{s.exam.title}</h3>
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm text-text sm:grid-cols-2">
            <Detail icon={CalendarClock} label={t("admin.schedules.window")}>{formatTimeRange(s.windowStart, s.windowEnd, locale)}</Detail>
            <Detail icon={Clock} label={t("admin.schedules.duration")}>{t("admin.schedules.minutes", { count: s.durationMinutes })}</Detail>
            <Detail icon={DoorOpen} label={t("admin.schedules.rooms")}>{s.rooms.length ? s.rooms.map((r) => `${r.name} (${r.capacity ? t("admin.rooms.seats", { count: r.capacity }) : t("admin.rooms.capacityUnknown")})`).join(", ") : t("admin.schedules.anyRoom")}</Detail>
            <Detail icon={Eye} label={t("admin.schedules.invigilators")}>{s.invigilators.length ? s.invigilators.map((i) => i.fullName).join(", ") : t("admin.schedules.noInvigilators")}</Detail>
            <Detail icon={UserRound} label={t("admin.schedules.requestedBy")} wide>
              {t("admin.schedules.requestedByOn", { name: s.requestedBy?.fullName ?? "—", date: formatDateTime(s.createdAt, locale) })}
            </Detail>
          </dl>
          {s.decidedBy && !waiting && <p className="mt-3 text-xs text-muted">{t("admin.schedules.decidedBy", { name: s.decidedBy.fullName, date: formatDateTime(s.decidedAt, locale) })}</p>}
          {s.rejectionReason && <p className="mt-2 text-sm text-danger">{t("admin.exams.rejectionReason", { reason: s.rejectionReason })}</p>}
          {waiting && draft && <Alert tone="warning" className="mt-4">{t("admin.schedules.draftNote")}</Alert>}
        </div>
        {waiting && (
          <div className="flex shrink-0 gap-2 md:flex-col">
            <Button leftIcon={<CheckCircle2 className="h-4 w-4" />} onClick={() => onApprove(s)} disabled={draft}>{t("admin.schedules.approve")}</Button>
            <Button variant="outline" leftIcon={<XCircle className="h-4 w-4" />} onClick={() => onReject(s)}>{t("admin.schedules.reject")}</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ScheduleRequests() {
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<ScheduleStatus>("REQUESTED");
  const list = useApi<{ items: Schedule[] }>(paths.schedules({ status }), { keepPrevious: true });
  const waiting = useApi<{ items: Schedule[] }>(paths.schedules({ status: "REQUESTED" }));
  const [approving, setApproving] = useState<Schedule | null>(null);
  const [rejecting, setRejecting] = useState<Schedule | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Waiting requests: the soonest window first. Decided ones: the newest first.
  const items = [...(list.data?.items ?? [])].sort((a, b) => (status === "REQUESTED" ? a.windowStart.localeCompare(b.windowStart) : b.createdAt.localeCompare(a.createdAt)));
  const pending = waiting.data?.items.length;

  const decide = async (run: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await run();
      toast(done);
      setApproving(null);
      setRejecting(null);
      setReason("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // A chosen room has unknown capacity: the registrar may approve anyway after confirming.
  const unknownCapacity = error instanceof ApiError && error.code === "ROOM_CAPACITY_UNKNOWN";

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.scheduleRequests") }]} />}
        title={t("admin.schedules.title")}
        description={t("admin.schedules.subtitle")}
      />
      <div role="tablist" aria-label={t("admin.status")} className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-muted p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={status === f}
            onClick={() => setStatus(f)}
            className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", status === f ? "bg-primary text-primary-foreground shadow-card" : "text-muted hover:text-foreground")}
          >
            {f === "REQUESTED" ? t("admin.schedules.waiting") : t(`admin.exams.scheduleStatus.${f}`)}
            {f === "REQUESTED" && pending ? <span className="rounded-full bg-[var(--sky-500)] px-1.5 text-xs font-bold text-white">{pending}</span> : null}
          </button>
        ))}
      </div>

      {list.error && !list.data ? (
        <Card><QueryError state={list} /></Card>
      ) : !list.data ? (
        <div className="space-y-4" aria-busy="true"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={CalendarClock} title={status === "REQUESTED" ? t("admin.schedules.emptyWaiting") : t("admin.schedules.empty")} className="py-14" /></Card>
      ) : (
        <div className="space-y-4">
          {items.map((s) => (
            <RequestCard key={s.id} s={s} onApprove={(x) => { setError(null); setApproving(x); }} onReject={(x) => { setError(null); setReason(""); setRejecting(x); }} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!approving}
        onOpenChange={(o) => { if (!o && !busy) setApproving(null); }}
        title={t("admin.schedules.approveTitle")}
        description={
          approving ? (
            <span className="block space-y-3">
              <span className="block">{t("admin.schedules.approveBody", { exam: approving.exam.title, course: approving.exam.course.code })}</span>
              {unknownCapacity ? <Alert tone="warning">{t("admin.rooms.unknownConfirm")}</Alert> : error ? <DecisionError error={error} /> : null}
            </span>
          ) : null
        }
        confirmLabel={unknownCapacity ? t("admin.rooms.approveAnyway") : t("admin.schedules.approve")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => { if (approving) void decide(() => approveSchedule(approving.id, { confirmUnknownCapacity: unknownCapacity }), t("admin.schedules.approvedToast")); }}
      />

      <Modal
        open={!!rejecting}
        onOpenChange={(o) => { if (!o && !busy) setRejecting(null); }}
        title={t("admin.schedules.rejectTitle")}
        description={rejecting ? `${rejecting.exam.course.code} · ${rejecting.exam.title}` : undefined}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={busy}>{t("common.cancel")}</Button>
            <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => { if (rejecting) void decide(() => rejectSchedule(rejecting.id, reason.trim()), t("admin.schedules.rejectedToast")); }}>
              {t("admin.schedules.reject")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <DecisionError error={error} />
          <Field label={t("admin.schedules.reason")} hint={t("admin.schedules.reasonHint")} required>
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={4} />}
          </Field>
        </div>
      </Modal>
    </>
  );
}
