"use client";

/**
 * Add time for one student (POST /api/invigilation/attempts/:id/extensions).
 * The backend's rules apply and are checked again on the server: 1–15
 * minutes per grant, 15 in total per attempt, a reason, only while the attempt
 * is in progress, and the deadline is calculated by the server (base deadline
 * plus the total extension). The dialog shows the student's current time left
 * and what is already granted, then asks for confirmation before applying.
 */
import { Clock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { grantExtension } from "@/lib/api/invigilator";
import { useI18n } from "@/lib/i18n/i18n";
import { formatClock } from "@/lib/student/exam-clock";
import { MAX_EXTENSION_MINUTES, type LiveStudent } from "@/types/invigilator";

export function ExtensionDialog({ student, remainingSeconds, onClose, onDone }: { student: LiveStudent; remainingSeconds: number; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const granted = student.extensionMinutes ?? 0;
  const allowed = MAX_EXTENSION_MINUTES - granted;
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const n = Number(minutes);
  const minutesOk = Number.isInteger(n) && n >= 1 && n <= Math.min(MAX_EXTENSION_MINUTES, allowed);
  const reasonOk = reason.trim().length > 0 && reason.trim().length <= 500;
  const name = student.student.fullName;

  const review = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (minutesOk && reasonOk) setConfirming(true);
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await grantExtension(student.attemptId!, n, reason.trim());
      // The server moved the deadline later by exactly n minutes; the live list confirms it at the next poll.
      toast(t("invigilator.extension.done", { minutes: n, name, time: formatClock(remainingSeconds + n * 60) }));
      onDone();
    } catch (err) {
      setError(err);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={!confirming}
        onOpenChange={(o) => !o && onClose()}
        title={t("invigilator.extension.title", { name })}
        closeLabel={t("common.cancel")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" form="extension-form" disabled={allowed <= 0}>{t("invigilator.extension.submit")}</Button>
          </>
        }
      >
        <form id="extension-form" onSubmit={review} className="space-y-4" noValidate>
          <FormError error={error} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-border p-3">
              <dt className="flex items-center gap-1 text-xs text-muted"><Clock className="h-3.5 w-3.5" aria-hidden />{t("invigilator.extension.current")}</dt>
              <dd className="mt-1 font-mono text-lg font-bold text-foreground tabular-nums">{formatClock(remainingSeconds)}</dd>
            </div>
            <div className="rounded-xl border border-border p-3">
              <dt className="text-xs text-muted">{t("invigilator.extension.granted")}</dt>
              <dd className="mt-1 text-lg font-bold text-foreground tabular-nums">{t("invigilator.student.extensionValue", { minutes: granted })}</dd>
            </div>
          </dl>
          {allowed > 0 ? <p className="text-xs text-muted">{t("invigilator.extension.remainingAllowed", { minutes: allowed })}</p> : <Alert tone="warning">{t("invigilator.extension.limit")}</Alert>}
          <Field label={t("invigilator.extension.minutes")} hint={t("invigilator.extension.minutesHint")} error={touched && !minutesOk ? t("invigilator.extension.minutesHint") : undefined} required>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} type="number" min={1} max={Math.min(MAX_EXTENSION_MINUTES, allowed)} step={1} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={allowed <= 0} className="sm:w-32" />}
          </Field>
          <Field label={t("invigilator.extension.reason")} hint={t("invigilator.extension.reasonHint")} error={touched && !reasonOk ? t("validation.required") : undefined} required>
            {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} disabled={allowed <= 0} />}
          </Field>
        </form>
      </Modal>

      <Modal
        open={confirming}
        onOpenChange={(o) => !o && !busy && setConfirming(false)}
        title={t("invigilator.extension.confirmTitle", { minutes: n, name })}
        description={t("invigilator.extension.confirmBody", { minutes: n })}
        closeLabel={t("common.cancel")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>{t("common.back")}</Button>
            <Button onClick={apply} loading={busy}>{t("invigilator.extension.apply")}</Button>
          </>
        }
      >
        <p className="rounded-xl bg-surface-muted p-3 text-sm text-text">{reason.trim()}</p>
      </Modal>
    </>
  );
}
