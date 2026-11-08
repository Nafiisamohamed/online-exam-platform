"use client";

/**
 * One student's monitoring details: the status and timing from the live list,
 * the tab-switch log (GET /api/invigilation/attempts/:id/focus-events, with
 * server-recorded times), the notes about the student, and the actions (add
 * time, add note). Only status is shown: the backend gives invigilators no
 * questions, answers or marks. The server ends the examination at the 3rd
 * counted tab switch; the lecturer reviews the events.
 */
import { AlertTriangle, Clock, MessageSquarePlus } from "lucide-react";
import { QueryState } from "@/components/admin/query-state";
import { DetailList } from "@/components/admin/admin-ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { invigilatorPaths } from "@/lib/api/invigilator";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { formatClock } from "@/lib/student/exam-clock";
import type { FocusEvent, InvigilatorNote, LiveStudent } from "@/types/invigilator";
import { NotesList } from "./notes-panel";
import { LiveStatusBadge } from "./status-badge";

function FocusLog({ attemptId, countedNow }: { attemptId: string; countedNow: number }) {
  const { t, locale } = useI18n();
  // The log is re-read whenever the live list reports a different number of counted losses.
  const events = useApi<{ items: FocusEvent[] }>(`${invigilatorPaths.focusEvents(attemptId)}?n=${countedNow}`);
  return (
    <QueryState state={events} skeleton="h-20 w-full">
      {({ items }) =>
        items.length === 0 ? (
          <p className="text-sm text-muted">{t("invigilator.student.focusNone")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <span className="text-text">{t("invigilator.student.focusLost")} {formatDateTime(e.lostAt, locale)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{e.returnedAt ? `${t("invigilator.student.focusDuration")} ${((e.durationMs ?? 0) / 1000).toFixed(1)} s` : t("invigilator.student.focusStill")}</span>
                  {e.returnedAt && <Badge tone={e.isCounted ? "warning" : "neutral"}>{e.isCounted ? t("invigilator.student.focusCounted") : t("invigilator.student.focusShort")}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

export function StudentDialog({ student, remaining, canAct, notes, onAddTime, onAddNote, onClose }: {
  student: LiveStudent;
  /** Time left in seconds, counted forward from the last poll. */
  remaining: number;
  canAct: boolean;
  notes: InvigilatorNote[];
  onAddTime: () => void;
  onAddNote: () => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const started = student.attemptId !== null;
  const inProgress = student.status === "IN_PROGRESS" || student.status === "DISCONNECTED";
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={student.student.fullName} description={`${student.student.studentNumber ?? ""}`} closeLabel={t("common.close")} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <LiveStatusBadge status={student.status} />
          {student.focusWarning && <Badge tone="warning"><AlertTriangle className="h-3 w-3" aria-hidden />{t("invigilator.monitor.warning")}</Badge>}
        </div>

        {!started ? (
          <Alert tone="info">{t("invigilator.student.notStarted")}</Alert>
        ) : (
          <DetailList
            items={[
              { label: t("invigilator.student.startedAt"), value: formatDateTime(student.startedAt, locale) },
              ...(inProgress ? [{ label: t("invigilator.monitor.columns.remaining"), value: <span className="font-mono font-bold tabular-nums">{formatClock(remaining)}</span> }] : []),
              { label: t("invigilator.student.deadline"), value: formatDateTime(student.deadline, locale) },
              { label: t("invigilator.student.extension"), value: t("invigilator.student.extensionValue", { minutes: student.extensionMinutes ?? 0 }) },
              { label: t("invigilator.student.answered"), value: `${student.answeredCount ?? 0} / ${student.totalQuestions ?? 0}` },
              ...(student.status === "SUBMITTED"
                ? [
                    { label: t("invigilator.student.submittedAt"), value: formatDateTime(student.submittedAt, locale) },
                    { label: t("invigilator.monitor.columns.submission"), value: student.submissionType === "AUTO_DEADLINE" ? t("invigilator.monitor.auto") : t("invigilator.monitor.manual") },
                  ]
                : []),
            ]}
          />
        )}

        {started && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              {t("invigilator.student.focusTitle")}
              <Badge tone={student.focusWarning ? "warning" : "neutral"}>{t("invigilator.student.focusCount", { count: student.countedFocusLosses ?? 0 })}</Badge>
            </h3>
            {student.focusWarning && <Alert tone="warning" className="mb-2">{t("invigilator.student.focusWarning")}</Alert>}
            <FocusLog attemptId={student.attemptId!} countedNow={student.countedFocusLosses ?? 0} />
            <p className="mt-2 text-xs text-muted">{t("invigilator.student.focusNote")}</p>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{t("invigilator.student.notesTitle")}</h3>
          {notes.length === 0 ? <p className="text-sm text-muted">{t("invigilator.student.notesEmpty")}</p> : <NotesList notes={notes} />}
        </section>

        {canAct && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" leftIcon={<MessageSquarePlus className="h-4 w-4" />} onClick={onAddNote}>{t("invigilator.student.addNote")}</Button>
            {inProgress && <Button leftIcon={<Clock className="h-4 w-4" />} onClick={onAddTime}>{t("invigilator.student.giveTime")}</Button>}
          </div>
        )}
      </div>
    </Modal>
  );
}
