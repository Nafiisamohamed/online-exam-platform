"use client";

/**
 * The exam screen: one question at a time, a navigator, the server-synced
 * timer, save status per question, and submission with a summary. All rules
 * (deadline, saving, focus counting, submission) are the server's; see
 * use-exam-session.ts. Correct answers are never part of the data.
 */
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Flag, LayoutGrid, Loader2, Send, WifiOff, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api/client";
import { QueryError } from "@/components/admin/query-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import { errorText } from "@/lib/i18n/error-text";
import { useI18n } from "@/lib/i18n/i18n";
import { formatClock, timerLevel } from "@/lib/student/exam-clock";
import type { Attempt, AttemptQuestion } from "@/types/student";
import { useExamSession, type LocalAnswer, type SaveStatus } from "./use-exam-session";

function SaveLine({ status, answered }: { status: SaveStatus | undefined; answered: boolean }) {
  const { t } = useI18n();
  // "Saved" only means something once there is an answer on the server.
  if (!status || (status === "saved" && !answered)) return null;
  const map: Record<SaveStatus, { text: string; cls: string; icon: ReactNode }> = {
    saved: { text: t("student.attempt.save.saved"), cls: "text-success", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
    dirty: { text: t("student.attempt.save.unsaved"), cls: "text-muted", icon: null },
    saving: { text: t("student.attempt.save.saving"), cls: "text-muted", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> },
    error: { text: t("student.attempt.save.failed"), cls: "text-warning", icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> },
    rejected: { text: t("student.attempt.save.rejected"), cls: "text-danger", icon: <XCircle className="h-3.5 w-3.5" aria-hidden /> },
  };
  const m = map[status];
  return <p role="status" className={cn("flex items-center gap-1.5 text-xs font-medium", m.cls)}>{m.icon}{m.text}</p>;
}

function AnswerInput({ q, a, onChange, onBlur }: { q: AttemptQuestion; a: LocalAnswer | undefined; onChange: (patch: { selectedOptionId?: string | null; textAnswer?: string }, immediate: boolean) => void; onBlur: () => void }) {
  const { t } = useI18n();
  if (q.type === "MCQ" || q.type === "TRUE_FALSE") {
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">{t("student.attempt.yourAnswer")}</legend>
        {q.options.map((o) => {
          const on = a?.selectedOptionId === o.id;
          const label = q.type === "TRUE_FALSE" ? (o.text.toLowerCase() === "true" ? t("student.attempt.true") : o.text.toLowerCase() === "false" ? t("student.attempt.false") : o.text) : o.text;
          return (
            <label key={o.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-base transition-colors", on ? "border-accent bg-accent-soft font-medium text-foreground" : "border-border hover:border-border-strong hover:bg-surface-muted")}>
              <input type="radio" name={`q-${q.id}`} checked={on} onChange={() => onChange({ selectedOptionId: o.id }, true)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent-strong)]" />
              <span className="min-w-0 break-words">{label}</span>
            </label>
          );
        })}
        {a?.selectedOptionId && (
          <button type="button" onClick={() => onChange({ selectedOptionId: null }, true)} className="text-xs font-semibold text-muted underline-offset-2 hover:text-foreground hover:underline">
            {t("student.attempt.clearChoice")}
          </button>
        )}
      </fieldset>
    );
  }
  const common = { "aria-label": t("student.attempt.yourAnswer"), value: a?.textAnswer ?? "", placeholder: t("student.attempt.typeAnswer"), onBlur, maxLength: 20000 };
  return q.type === "SHORT_ANSWER" ? (
    <Input {...common} onChange={(e) => onChange({ textAnswer: e.target.value }, false)} className="h-12 text-base" />
  ) : (
    <div>
      <Textarea {...common} onChange={(e) => onChange({ textAnswer: e.target.value }, false)} rows={12} className="text-base leading-relaxed" />
      <p className="mt-1 text-right text-xs text-subtle tabular-nums">{(a?.textAnswer ?? "").length}</p>
    </div>
  );
}

function Navigator({ questions, current, onPick, isAnswered, flags }: { questions: AttemptQuestion[]; current: number; onPick: (i: number) => void; isAnswered: (id: string) => boolean; flags: Record<string, boolean> }) {
  const { t } = useI18n();
  return (
    <div>
      <ol className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
        {questions.map((q, i) => {
          const answered = isAnswered(q.id);
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === current ? "step" : undefined}
                aria-label={`${q.position}: ${answered ? t("student.attempt.answered") : t("student.attempt.unanswered")}${flags[q.id] ? `, ${t("student.attempt.flagged")}` : ""}`}
                className={cn(
                  "relative flex h-10 w-full items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                  answered ? "border-transparent bg-primary text-primary-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
                  i === current && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                )}
              >
                {q.position}
                {flags[q.id] && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-surface bg-warning" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="mt-4 space-y-1.5 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-primary" aria-hidden />{t("student.attempt.answered")}</li>
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-border-strong" aria-hidden />{t("student.attempt.unanswered")}</li>
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-warning" aria-hidden />{t("student.attempt.flagged")}</li>
      </ul>
    </div>
  );
}

export function Completion({ a }: { a: Attempt }) {
  const { t, locale } = useI18n();
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <CardContent className="space-y-5 py-8 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success-soft text-success"><CheckCircle2 className="h-8 w-8" aria-hidden /></span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("student.completion.title")}</h1>
            <p className="mt-2 text-sm text-muted">{a.exam.course.code} · {a.exam.title}</p>
          </div>
          <Alert tone={a.submissionType === "AUTO_DEADLINE" ? "info" : "success"} className="text-left">
            {a.submissionType === "AUTO_DEADLINE" ? t("student.completion.auto") : t("student.completion.manual")}
          </Alert>
          <dl className="grid gap-3 text-left text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted">{t("student.completion.submittedAt")}</dt><dd className="mt-1 font-semibold text-foreground">{formatDateTime(a.submittedAt, locale)}</dd></div>
            <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted">{t("student.completion.answered")}</dt><dd className="mt-1 font-semibold text-foreground tabular-nums">{a.answeredCount} / {a.totalQuestions}</dd></div>
            <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted">{t("student.completion.focus")}</dt><dd className="mt-1 font-semibold text-foreground tabular-nums">{a.countedFocusLosses}</dd></div>
          </dl>
          <p className="text-sm text-muted">{t("student.completion.resultsLater")}</p>
          <Link href="/student/exams" className={buttonClasses("primary")}>{t("student.completion.back")}</Link>
        </CardContent>
      </Card>
    </div>
  );
}

export function ExamInterface({ attemptId }: { attemptId: string }) {
  const { t, locale } = useI18n();
  const s = useExamSession(attemptId);
  const [current, setCurrent] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [seenExtension, setSeenExtension] = useState<number | null>(null);

  // Remember the extension already known at load, so only new ones are announced.
  if (s.attempt && seenExtension === null) setSeenExtension(s.attempt.extensionMinutes);

  if (s.loadError) {
    const error = s.loadError instanceof ApiError ? s.loadError : new ApiError(0, "NETWORK_ERROR", "");
    return <Card className="mx-auto mt-10 max-w-xl"><QueryError state={{ error, reload: () => location.reload() }} /></Card>;
  }
  if (s.finished) return <Completion a={s.finished} />;
  if (!s.attempt || s.remaining === null) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 py-8" aria-busy>
        <p className="text-sm text-muted">{t("student.attempt.loading")}</p>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const qs = s.questions;
  const q = qs[Math.min(current, qs.length - 1)];
  const level = timerLevel(s.remaining);
  const flaggedCount = qs.filter((x) => s.flags[x.id]).length;
  const go = (i: number) => {
    setCurrent(Math.max(0, Math.min(qs.length - 1, i)));
    setNavOpen(false);
  };
  const newExtension = seenExtension !== null && s.extensionMinutes > seenExtension ? s.extensionMinutes - seenExtension : 0;

  const doSubmit = async () => {
    setSubmitError(null);
    try {
      await s.submit();
    } catch (error) {
      setSubmitError(error);
    }
  };

  return (
    <div className="pb-24 lg:pb-8">
      {/* Exam bar */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground sm:text-base">{s.attempt.exam.title}</p>
            <p className="truncate text-xs text-muted">{s.attempt.exam.course.code} · {s.attempt.exam.course.name}</p>
          </div>
          <div
            role="timer"
            aria-label={t("student.attempt.timeLeft")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-lg font-bold tabular-nums",
              level === "one" ? "bg-danger text-white" : level === "ten" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent-foreground",
            )}
          >
            <Clock className="h-4 w-4" aria-hidden />
            {s.remaining === 0 ? t("student.attempt.timeOver") : formatClock(s.remaining)}
          </div>
          <Button leftIcon={<Send className="h-4 w-4" />} onClick={() => setConfirming(true)} className="hidden sm:inline-flex">{t("student.attempt.submit")}</Button>
        </div>
        <div className="mx-auto mt-2 flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {s.online ? (
            <span className="text-success">● {t("student.attempt.connection.online")}</span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-warning"><WifiOff className="h-3.5 w-3.5" aria-hidden />{t("student.attempt.connection.offline")}</span>
          )}
          <span className={s.unsavedCount ? "text-warning" : "text-muted"}>{s.unsavedCount ? t("student.attempt.save.pending", { count: s.unsavedCount }) : t("student.attempt.save.allSaved")}</span>
          <span className="text-muted">{t("student.attempt.navigatorSummary", { answered: s.answeredCount, total: qs.length })}</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-3">
        {level === "one" && s.remaining > 0 && <Alert tone="danger">{t("student.attempt.warnings.oneMinute")}</Alert>}
        {level === "ten" && <Alert tone="warning">{t("student.attempt.warnings.tenMinutes")}</Alert>}
        {newExtension > 0 && <Alert tone="info">{t("student.attempt.extension", { minutes: newExtension })}</Alert>}
        {s.focus.warning && <Alert tone="warning">{t("student.attempt.warnings.focus", { count: s.focus.count })}</Alert>}
      </div>

      <div className="mx-auto mt-4 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Card className="min-w-0">
          <CardContent className="space-y-5 py-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-muted">{t("student.attempt.question", { number: q.position, total: qs.length })}</p>
              <div className="flex items-center gap-2">
                <Badge tone="navy">{t("student.attempt.marks", { marks: formatNumber(q.marks, locale, 2) })}</Badge>
                <Button variant={s.flags[q.id] ? "secondary" : "ghost"} size="sm" leftIcon={<Flag className="h-3.5 w-3.5" />} onClick={() => void s.toggleFlag(q.id)} aria-pressed={!!s.flags[q.id]}>
                  {s.flags[q.id] ? t("student.attempt.unflag") : t("student.attempt.flag")}
                </Button>
              </div>
            </div>
            <p className="text-lg leading-relaxed whitespace-pre-wrap text-foreground">{q.text}</p>
            {q.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- served by the API with the session cookie
              <img src={q.imageUrl} alt="" className="max-h-80 rounded-xl border border-border object-contain" />
            )}
            <AnswerInput q={q} a={s.answers[q.id]} onChange={(patch, immediate) => s.change(q.id, patch, immediate)} onBlur={() => s.flush(q.id)} />
            <SaveLine status={s.answers[q.id]?.status} answered={s.isAnswered(q.id)} />
            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <Button variant="outline" leftIcon={<ChevronLeft className="h-4 w-4" />} onClick={() => go(current - 1)} disabled={current === 0}>{t("student.attempt.previous")}</Button>
              <Button variant="outline" className="lg:hidden" leftIcon={<LayoutGrid className="h-4 w-4" />} onClick={() => setNavOpen(true)}>{current + 1}/{qs.length}</Button>
              <Button variant="outline" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={() => go(current + 1)} disabled={current === qs.length - 1}>{t("student.attempt.next")}</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hidden self-start lg:sticky lg:top-36 lg:block">
          <CardContent className="space-y-4 py-5">
            <p className="text-sm font-semibold text-foreground">{t("student.attempt.navigator")}</p>
            <Navigator questions={qs} current={current} onPick={go} isAnswered={s.isAnswered} flags={s.flags} />
            <Button className="w-full" leftIcon={<Send className="h-4 w-4" />} onClick={() => setConfirming(true)}>{t("student.attempt.submit")}</Button>
          </CardContent>
        </Card>
      </div>

      {/* Phones: a fixed submit bar. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur sm:hidden">
        <Button className="w-full" leftIcon={<Send className="h-4 w-4" />} onClick={() => setConfirming(true)}>{t("student.attempt.submit")}</Button>
      </div>

      <Modal open={navOpen} onOpenChange={setNavOpen} title={t("student.attempt.navigator")} description={t("student.attempt.navigatorSummary", { answered: s.answeredCount, total: qs.length })} closeLabel={t("common.close")}>
        <Navigator questions={qs} current={current} onPick={go} isAnswered={s.isAnswered} flags={s.flags} />
      </Modal>

      <Modal
        open={confirming}
        onOpenChange={(o) => !s.submitting && setConfirming(o)}
        title={t("student.attempt.submitTitle")}
        description={t("student.attempt.submitBody")}
        closeLabel={t("student.attempt.keepWorking")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={s.submitting}>{t("student.attempt.keepWorking")}</Button>
            <Button onClick={doSubmit} loading={s.submitting}>{t("student.attempt.submitConfirm")}</Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2 text-text"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden />{t("student.attempt.summaryAnswered", { count: s.answeredCount })}</li>
          <li className="flex items-center gap-2 text-text"><XCircle className="h-4 w-4 text-subtle" aria-hidden />{t("student.attempt.summaryUnanswered", { count: qs.length - s.answeredCount })}</li>
          <li className="flex items-center gap-2 text-text"><Flag className="h-4 w-4 text-warning" aria-hidden />{t("student.attempt.summaryFlagged", { count: flaggedCount })}</li>
        </ul>
        {s.unsavedCount > 0 && <Alert tone="warning" className="mt-3">{t("student.attempt.summaryUnsaved", { count: s.unsavedCount })}</Alert>}
        {submitError ? <Alert tone="danger" className="mt-3" title={errorText(t, submitError)} /> : null}
      </Modal>
    </div>
  );
}
