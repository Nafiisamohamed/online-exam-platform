"use client";

/**
 * Grading one answer (GET /api/grading/answers/:id), following the backend's rules:
 * - non-essay answers (Needs review, or a regrade): the course lecturer sets
 *   the marks (PUT …/marks);
 * - essays: marks for every rubric criterion plus a comment (PUT …/essay);
 * - blind second grading (D7): the second grader sees an anonymous code and
 *   only their own marks; the course lecturer sees the other marks only once
 *   the essay is GRADED or in DISCREPANCY, and then sets the final mark
 *   (POST …/resolve). The server decides who sees what; this view only shows it.
 * - while results are published, marks are locked (reopen grading first).
 */
import { CheckCircle2, Circle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { lecturerPaths, markEssay, resolveDiscrepancy, setAnswerMarks } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { GradingAnswer, GradingStudent } from "@/types/lecturer";

export function studentLabel(s: GradingStudent, t: (k: "lecturer.grading.anonymous", v: { code: string }) => string) {
  return "anonymousCode" in s ? t("lecturer.grading.anonymous", { code: s.anonymousCode }) : `${s.fullName}${s.studentNumber ? ` (${s.studentNumber})` : ""}`;
}

const inRange = (v: string, max: number) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max + 1e-9;

function Response({ a }: { a: GradingAnswer }) {
  const { t } = useI18n();
  const q = a.question;
  if (q.type === "MCQ" || q.type === "TRUE_FALSE") {
    if (!a.response.selectedOptionId && q.options.length === 0) return <p className="text-sm text-muted">{t("lecturer.grading.noResponse")}</p>;
    return (
      <ul className="space-y-1.5">
        {q.options.map((o) => {
          const chosen = o.id === a.response.selectedOptionId;
          return (
            <li key={o.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", chosen ? "border-accent bg-accent-soft" : "border-border")}>
              {o.isCorrect ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <Circle className="h-4 w-4 text-subtle" aria-hidden />}
              <span className="flex-1 text-text">{q.type === "TRUE_FALSE" ? (o.text.toLowerCase() === "true" ? t("lecturer.questions.true") : t("lecturer.questions.false")) : o.text}</span>
              {chosen && <Badge tone="sky">{t("lecturer.grading.chosenOption")}</Badge>}
              {o.isCorrect && <Badge tone="success">{t("lecturer.grading.correctOption")}</Badge>}
            </li>
          );
        })}
      </ul>
    );
  }
  return a.response.textAnswer ? (
    <p className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">{a.response.textAnswer}</p>
  ) : (
    <p className="text-sm text-muted">{t("lecturer.grading.noResponse")}</p>
  );
}

function GradingForm({ a, examId, onDone }: { a: GradingAnswer; examId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const q = a.question;
  const locked = a.exam.resultsStatus === "PUBLISHED";
  const mine = a.marks.find((m) => m.graderRole === a.role);
  const [marks, setMarks] = useState(a.marksAwarded != null ? String(a.marksAwarded) : "");
  const [criteria, setCriteria] = useState<Record<string, string>>(() =>
    Object.fromEntries(q.rubric.map((r) => [r.id, String(mine?.criteria.find((c) => c.criterionId === r.id)?.marks ?? "")])),
  );
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [finalMarks, setFinalMarks] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const discrepancy = a.role === "FIRST" && a.gradingStatus === "DISCREPANCY";
  const essayTotal = Math.round(q.rubric.reduce((s, r) => s + (Number(criteria[r.id]) || 0), 0) * 100) / 100;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast(t("lecturer.grading.savedToast"));
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (discrepancy) {
      if (!inRange(finalMarks, q.maxMarks)) return;
      return void run(() => resolveDiscrepancy(examId, a.answerId, Number(finalMarks)));
    }
    if (q.type === "ESSAY") {
      if (!q.rubric.every((r) => inRange(criteria[r.id] ?? "", r.maxMarks))) return;
      return void run(() => markEssay(examId, a.answerId, q.rubric.map((r) => ({ criterionId: r.id, marks: Number(criteria[r.id]) })), comment.trim() || undefined));
    }
    if (!inRange(marks, q.maxMarks)) return;
    return void run(() => setAnswerMarks(examId, a.answerId, Number(marks), comment.trim() || undefined));
  };

  if (locked) return <Alert tone="info">{t("lecturer.grading.publishedLocked")}</Alert>;
  if (q.type === "ESSAY" && a.gradingStatus === "NOT_ANSWERED") return <Alert tone="info">{t("errors.ESSAY_NOT_ANSWERED")}</Alert>;

  return (
    <form id="grading-form" onSubmit={submit} className="space-y-4" noValidate>
      <FormError error={error} />
      {a.role === "SECOND" && <Alert tone="info">{t("lecturer.grading.blindNote")}</Alert>}
      {a.role === "FIRST" && a.gradingStatus === "AWAITING_SECOND_GRADE" && mine && <Alert tone="info">{t("lecturer.grading.awaitingSecond")}</Alert>}

      {discrepancy ? (
        <>
          <Alert tone="warning">{t("lecturer.grading.discrepancyNote")}</Alert>
          <ul className="space-y-1 text-sm">
            {a.marks.map((m) => (
              <li key={m.graderRole} className="text-text">
                {t(m.graderRole === "FIRST" ? "lecturer.grading.firstMarks" : "lecturer.grading.secondMarks", { marks: formatNumber(m.totalMarks, locale, 2) })}
                {m.comment ? <span className="block text-xs text-muted">{m.comment}</span> : null}
              </li>
            ))}
          </ul>
          <Field label={t("lecturer.grading.finalMarks", { max: q.maxMarks })} error={touched && !inRange(finalMarks, q.maxMarks) ? t("errors.MARKS_OUT_OF_RANGE", { max: q.maxMarks }) : undefined} required>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} type="number" min={0} max={q.maxMarks} step={0.01} inputMode="decimal" value={finalMarks} onChange={(e) => setFinalMarks(e.target.value)} className="sm:w-40" />}
          </Field>
        </>
      ) : q.type === "ESSAY" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">{t("lecturer.grading.rubric")}</legend>
          {q.rubric.map((r) => {
            const bad = touched && !inRange(criteria[r.id] ?? "", r.maxMarks);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-text">{r.description}</span>
                <span className="flex items-center gap-2 text-sm text-muted">
                  <Input aria-label={r.description} aria-invalid={bad || undefined} type="number" min={0} max={r.maxMarks} step={0.01} inputMode="decimal" className="w-24" value={criteria[r.id] ?? ""} onChange={(e) => setCriteria((c) => ({ ...c, [r.id]: e.target.value }))} />
                  {t("lecturer.grading.criterionMax", { max: formatNumber(r.maxMarks, locale, 2) })}
                </span>
                {bad && <span className="w-full text-xs text-danger">{t("errors.CRITERION_MARKS_OUT_OF_RANGE", { max: r.maxMarks })}</span>}
              </div>
            );
          })}
          <p className="text-right text-sm font-semibold text-foreground">{t("lecturer.grading.total", { total: formatNumber(essayTotal, locale, 2), max: formatNumber(q.maxMarks, locale, 2) })}</p>
        </fieldset>
      ) : (
        <Field label={t("lecturer.grading.marksFor", { max: q.maxMarks })} error={touched && !inRange(marks, q.maxMarks) ? t("errors.MARKS_OUT_OF_RANGE", { max: q.maxMarks }) : undefined} required>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} type="number" min={0} max={q.maxMarks} step={0.01} inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value)} className="sm:w-40" />}
        </Field>
      )}

      {!discrepancy && (
        <Field label={t("lecturer.grading.comment")} hint={t("lecturer.grading.commentHint")}>
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={q.type === "ESSAY" ? 5000 : 2000} rows={3} />}
        </Field>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>{discrepancy ? t("lecturer.grading.resolve") : t("lecturer.grading.saveMarks")}</Button>
      </div>
    </form>
  );
}

export function GradingPanel({ examId, answerId, onClose }: { examId: string; answerId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const answer = useApi<{ answer: GradingAnswer }>(lecturerPaths.gradingAnswer(answerId));
  const a = answer.data?.answer;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={a ? t("lecturer.grading.gradeTitle", { number: a.question.position, student: studentLabel(a.student, t) }) : t("common.loading")}
      closeLabel={t("common.close")}
      size="lg"
    >
      <QueryState state={answer} skeleton="h-64 w-full">
        {({ answer: data }) => (
          <div className="space-y-5">
            <div className="space-y-2">
              <span className="flex flex-wrap gap-1.5">
                <Badge tone="sky">{t(`admin.exams.questionTypes.${data.question.type}`)}</Badge>
                <Badge tone="navy">{t("lecturer.common.marksValue", { marks: formatNumber(data.question.maxMarks, locale, 2) })}</Badge>
                {data.gradingStatus && <Badge tone="neutral">{t(`lecturer.grading.statuses.${data.gradingStatus}`)}</Badge>}
              </span>
              <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground">{data.question.text}</p>
              {data.question.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- served by the API with the session cookie
                <img src={data.question.imageUrl} alt="" className="max-h-60 rounded-xl border border-border object-contain" />
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t("lecturer.grading.response")}</p>
              <Response a={data} />
            </div>
            {data.question.type === "SHORT_ANSWER" && data.question.acceptedAnswers.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{t("lecturer.grading.acceptedAnswers")}</p>
                <div className="flex flex-wrap gap-1.5">{data.question.acceptedAnswers.map((x, i) => <Badge key={i} tone="success">{x}</Badge>)}</div>
              </div>
            )}
            {data.marksAwarded != null && <p className="text-sm text-muted">{t("lecturer.grading.marksAwarded")}: <span className="font-semibold text-foreground">{formatNumber(data.marksAwarded, locale, 2)}</span></p>}
            <GradingForm a={data} examId={examId} onDone={onClose} />
          </div>
        )}
      </QueryState>
    </Modal>
  );
}
