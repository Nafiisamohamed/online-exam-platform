"use client";

/**
 * Dialogs of the exam page:
 * - SettingsDialog: PATCH /api/exams/:id (shuffling and fee are fixed after publishing);
 * - ScheduleDialog: POST /api/exams/:id/schedules, a request the registrar approves;
 * - PreviewDialog: GET /api/exams/:id/preview, one sample draw with the answer keys (nothing saved).
 */
import { useEffect, useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { lecturerPaths, loadExamPreview, requestSchedule, updateExamSettings } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/cn";
import { campusInputToIso, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { StaffMember } from "@/types/admin";
import type { ExamPreview, LecturerExam, Room } from "@/types/lecturer";
import { ExamSettingsFields, settingsFromExam, settingsInput, type SettingsDraft } from "./exam-settings-fields";
import { QuestionView } from "./question-view";

export function SettingsDialog({ exam, onClose }: { exam: LecturerExam; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const locked = exam.status === "PUBLISHED";
  const [title, setTitle] = useState(exam.title);
  const [settings, setSettings] = useState<SettingsDraft>(() => settingsFromExam(exam));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateExamSettings(exam.id, { title: title.trim(), ...settingsInput(settings, locked) });
      toast(t("lecturer.exams.settingsSaved"));
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("lecturer.exams.editSettings")}
      closeLabel={t("common.cancel")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="exam-settings" loading={busy}>{t("common.save")}</Button>
        </>
      }
    >
      <form id="exam-settings" onSubmit={submit} className="space-y-4" noValidate>
        {locked && <Alert tone="info">{t("lecturer.exams.lockedNote")}</Alert>}
        <FormError error={error} />
        <Field label={t("lecturer.exams.examTitle")} error={!title.trim() ? t("validation.required") : undefined} required>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}
        </Field>
        <ExamSettingsFields value={settings} onChange={setSettings} locked={locked} />
      </form>
    </Modal>
  );
}

function PickList<T extends { id: string }>({ legend, hint, items, selected, onChange, label }: { legend: string; hint?: string; items: T[]; selected: string[]; onChange: (ids: string[]) => void; label: (item: T) => string }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {hint ? <p className="mb-2 text-xs text-muted">{hint}</p> : <div className="mb-2" />}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const on = selected.includes(item.id);
          return (
            <label key={item.id} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", on ? "border-accent bg-accent-soft text-foreground" : "border-border text-muted")}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? selected.filter((x) => x !== item.id) : [...selected, item.id])} />
              {label(item)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ScheduleDialog({ examId, onClose }: { examId: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const rooms = useApi<{ items: Room[] }>(lecturerPaths.rooms);
  const invigilators = useApi<{ items: StaffMember[] }>(lecturerPaths.staff("INVIGILATOR"));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [invigilatorIds, setInvigilatorIds] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const startIso = campusInputToIso(start);
  const endIso = campusInputToIso(end);
  // The duration is the window length, worked out from the start and end (read-only).
  const minutes = startIso && endIso ? Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 60_000) : 0;
  const durationOk = minutes >= 5 && minutes <= 600;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!startIso || !endIso || !durationOk) return;
    setBusy(true);
    setError(null);
    try {
      await requestSchedule(examId, { windowStart: startIso, windowEnd: endIso, roomIds, invigilatorIds });
      toast(t("lecturer.exams.requestedToast"));
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("lecturer.exams.requestTitle")}
      description={t("lecturer.exams.requestHint")}
      closeLabel={t("common.cancel")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="schedule-form" loading={busy}>{t("lecturer.exams.requestAction")}</Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("lecturer.exams.windowStart")} error={touched && !startIso ? t("validation.required") : undefined} required>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}
          </Field>
          <Field label={t("lecturer.exams.windowEnd")} error={touched && !endIso ? t("validation.required") : undefined} required>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} type="datetime-local" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
        </div>
        <Field label={t("lecturer.exams.duration")} hint={t("lecturer.exams.durationAuto")} error={touched && startIso && endIso && !durationOk ? t("lecturer.exams.durationHint") : undefined}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} readOnly value={minutes > 0 ? t("admin.minutes", { count: minutes }) : "—"} className="sm:w-48" />}
        </Field>
        {rooms.data ? (
          <PickList legend={t("lecturer.exams.rooms")} hint={t("lecturer.exams.roomsHint")} items={rooms.data.items.filter((r) => r.isActive)} selected={roomIds} onChange={setRoomIds} label={(r) => `${r.name} (${r.building}) · ${r.capacity ? t("admin.rooms.seats", { count: r.capacity }) : t("admin.rooms.capacityUnknown")}`} />
        ) : <Skeleton className="h-12 w-full" />}
        {invigilators.data ? (
          <PickList legend={t("lecturer.exams.invigilators")} items={invigilators.data.items} selected={invigilatorIds} onChange={setInvigilatorIds} label={(i) => i.fullName} />
        ) : <Skeleton className="h-12 w-full" />}
      </form>
    </Modal>
  );
}

export function PreviewDialog({ examId, onClose }: { examId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  // The preview is a fresh random draw each time, so it is loaded directly, not cached.
  const [state, setState] = useState<{ data?: ExamPreview; error?: unknown }>({});
  useEffect(() => {
    let live = true;
    loadExamPreview(examId).then((data) => live && setState({ data }), (error: unknown) => live && setState({ error }));
    return () => {
      live = false;
    };
  }, [examId]);

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t("lecturer.exams.previewTitle")} description={t("lecturer.exams.previewHint")} closeLabel={t("common.close")} size="lg" footer={<Button onClick={onClose}>{t("common.close")}</Button>}>
      {state.error ? (
        <FormError error={state.error} />
      ) : !state.data ? (
        <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm font-semibold text-foreground">{t("lecturer.exams.totals", { questions: state.data.questions.length, marks: formatNumber(state.data.totalMarks, locale, 2) })}</p>
          {state.data.questions.map((q) => (
            <div key={q.position} className="border-b border-border pb-5 last:border-0">
              <QuestionView q={q} number={q.position} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

