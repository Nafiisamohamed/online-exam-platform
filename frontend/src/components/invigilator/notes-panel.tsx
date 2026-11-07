"use client";

/**
 * Session observations (GET / POST /api/invigilation/sessions/:id/notes).
 * A note is about the whole session or one student of it. The backend has no
 * separate "incident" record, so notes are the incident log: author and time
 * come from the server. Only assigned invigilators can add notes.
 */
import { MessageSquarePlus, StickyNote } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { addNote, invigilatorPaths } from "@/lib/api/invigilator";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { InvigilatorNote, LiveStudent } from "@/types/invigilator";

export function NoteDialog({ sessionId, students, defaultStudentId, onClose }: { sessionId: string; students: LiveStudent[]; defaultStudentId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [studentId, setStudentId] = useState(defaultStudentId ?? "");
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addNote(sessionId, text.trim(), studentId || undefined);
      toast(t("invigilator.notes.saved"));
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
      title={t("invigilator.notes.add")}
      closeLabel={t("common.cancel")}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="note-form" loading={busy}>{t("invigilator.notes.save")}</Button>
        </>
      }
    >
      <form id="note-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />
        <Field label={t("invigilator.notes.student")}>
          {({ id }) => (
            <Select id={id} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">{t("invigilator.notes.wholeSession")}</option>
              {students.map((s) => <option key={s.student.id} value={s.student.id}>{s.student.fullName} ({s.student.studentNumber})</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("invigilator.notes.text")} hint={t("invigilator.notes.textHint")} error={touched && !text.trim() ? t("validation.required") : undefined} required>
          {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={5} autoFocus />}
        </Field>
      </form>
    </Modal>
  );
}

export function NotesList({ notes, studentId }: { notes: InvigilatorNote[]; studentId?: string }) {
  const { t, locale } = useI18n();
  const rows = studentId ? notes.filter((n) => n.studentId === studentId) : notes;
  if (rows.length === 0) return <EmptyState icon={StickyNote} title={t("invigilator.notes.empty")} className="py-8" />;
  return (
    <ul className="space-y-3">
      {rows.map((n) => (
        <li key={n.id} className="rounded-xl border border-border px-4 py-3 text-sm">
          <p className="whitespace-pre-wrap text-foreground">{n.text}</p>
          <p className="mt-1.5 text-xs text-muted">
            {t("invigilator.notes.by", { name: n.author.fullName, time: formatDateTime(n.createdAt, locale) })} · {n.student ? t("invigilator.notes.about", { name: n.student.fullName }) : t("invigilator.notes.session")}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The session's notes with an "Add observation" button. */
export function NotesCard({ sessionId, students }: { sessionId: string; students: LiveStudent[] }) {
  const { t } = useI18n();
  const notes = useApi<{ items: InvigilatorNote[] }>(invigilatorPaths.notes(sessionId));
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader title={t("invigilator.notes.title")} description={t("invigilator.notes.subtitle")} action={<Button size="sm" leftIcon={<MessageSquarePlus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>{t("invigilator.notes.add")}</Button>} />
      <CardContent className="pt-4">
        <QueryState state={notes} skeleton="h-24 w-full">{({ items }) => <NotesList notes={items} />}</QueryState>
      </CardContent>
      {adding && <NoteDialog sessionId={sessionId} students={students} onClose={() => setAdding(false)} />}
    </Card>
  );
}
