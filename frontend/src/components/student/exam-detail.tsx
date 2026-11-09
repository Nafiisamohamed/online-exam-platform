"use client";

/**
 * One examination before (or after) the student sits it: instructions, the
 * rules the server applies, the window with a countdown, the fee, and the
 * Start / Continue button. The button follows the server's own `canStart`
 * (window open, fee paid, not yet started) and the start request itself is
 * checked again by the server (POST /api/exams/:examId/attempts), which
 * returns the existing attempt instead of creating a second one.
 */
import { ArrowRight, CalendarClock, CheckCircle2, Clock, CreditCard, Info, PlayCircle } from "lucide-react";
import { ExamTypeBadge } from "@/components/exam-type-badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { useServerNow } from "@/hooks/use-server-now";
import { ApiError } from "@/lib/api/client";
import { startAttempt, studentPaths } from "@/lib/api/student";
import { invalidate, useApi } from "@/lib/api/use-api";
import { formatDateTime, formatTimeRange, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { MyExam } from "@/types/student";
import { stateTone, useCountdownText } from "./exam-card";
import { PayDialog } from "./pay-dialog";

function DetailBody({ exam }: { exam: MyExam }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const serverNow = useServerNow();
  const countdown = useCountdownText();
  const [confirm, setConfirm] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const s = exam.schedule;
  const started = exam.state === "IN_PROGRESS";
  const opensIn = s && serverNow !== null && exam.state === "UPCOMING" ? countdown(s.windowStart, serverNow) : null;

  // When the countdown reaches the opening time, ask the server again (it decides canStart).
  const reached = opensIn?.total === 0;
  useEffect(() => {
    if (reached) invalidate(studentPaths.myExams);
  }, [reached]);

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const { attempt } = await startAttempt(exam.id);
      router.push(`/exam/${attempt.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
      setConfirm(false);
    }
  };

  const rules = [
    t("student.exams.rules.oneAttempt"),
    s ? t("student.exams.rules.deadline", { minutes: s.durationMinutes }) : null,
    t("student.exams.rules.autosave"),
    t("student.exams.rules.focus"),
    t("student.exams.rules.autoSubmit"),
    t("student.exams.rules.network"),
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.myExams"), href: "/student/exams" }, { label: exam.title }]} />}
        title={exam.title}
        description={<span className="flex flex-wrap items-center gap-2"><ExamTypeBadge type={exam.examType} /><Badge tone={stateTone[exam.state]} dot>{t(`student.common.examState.${exam.state}`)}</Badge><span className="text-sm text-muted">{exam.course.code} · {exam.course.name}</span></span>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("student.exams.instructions")} />
            <CardContent className="pt-3"><p className="text-sm leading-relaxed whitespace-pre-wrap text-text">{exam.instructions || t("student.exams.noInstructions")}</p></CardContent>
          </Card>
          <Card>
            <CardHeader title={t("student.exams.rulesTitle")} />
            <CardContent className="pt-3">
              <ul className="space-y-2.5 text-sm text-text">
                {rules.map((r, i) => <li key={i} className="flex gap-2.5"><Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden />{r}</li>)}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardContent className="space-y-4 py-5">
            {s && (
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2 text-text"><CalendarClock className="h-4 w-4 text-subtle" aria-hidden />{formatDate(s.windowStart, locale)} · {formatTimeRange(s.windowStart, s.windowEnd, locale)}</li>
                <li className="flex items-center gap-2 text-text"><Clock className="h-4 w-4 text-subtle" aria-hidden />{t("student.common.duration")}: {t("student.common.minutes", { count: s.durationMinutes })}</li>
                <li className="text-muted">{t("student.common.questions", { count: exam.totalQuestions })} · {t("student.common.marks", { marks: exam.totalMarks })}</li>
              </ul>
            )}
            {opensIn && <p className="rounded-xl bg-accent-soft px-3 py-2 text-center text-sm font-semibold text-accent-foreground" role="timer">{t("student.common.opensIn", { time: opensIn.text })}</p>}
            {exam.fee.required && (
              exam.fee.paid ? (
                <p className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{t("student.common.feePaid", { receipt: exam.fee.receiptNumber ?? "—" })}</p>
              ) : (
                <div className="space-y-2">
                  <Alert tone="warning">{t("student.exams.payFirst")} ({exam.fee.amount} {exam.fee.currency})</Alert>
                  {(exam.state === "UPCOMING" || exam.state === "OPEN") && <Button variant="secondary" className="w-full" leftIcon={<CreditCard className="h-4 w-4" />} onClick={() => setPaying(true)}>{t("student.payments.pay")}</Button>}
                </div>
              )
            )}
            <FormError error={error} />
            {error instanceof ApiError && error.code === "PAYMENT_REQUIRED" && <Button variant="secondary" className="w-full" onClick={() => setPaying(true)}>{t("student.payments.pay")}</Button>}

            {started && (
              <>
                <Alert tone="info">{t("student.exams.resumeNote")}</Alert>
                <Button className="w-full" size="lg" leftIcon={<ArrowRight className="h-4 w-4" />} onClick={begin} loading={busy}>{t("student.common.continue")}</Button>
              </>
            )}
            {(exam.state === "OPEN" || exam.state === "UPCOMING") && !started && (
              <>
                <Button className="w-full" size="lg" leftIcon={<PlayCircle className="h-4 w-4" />} onClick={() => setConfirm(true)} disabled={!exam.canStart}>{t("student.common.start")}</Button>
                {!exam.canStart && exam.state === "UPCOMING" && <p className="text-center text-xs text-muted">{t("student.exams.waitingToOpen")}</p>}
              </>
            )}
            {exam.state === "CLOSED" && <Alert tone="info">{t("student.exams.closedNote")}</Alert>}
            {exam.state === "TERMINATED" && <Alert tone="danger">{t("student.exams.terminatedNote")}</Alert>}
            {exam.state === "SUBMITTED" && (
              <>
                <Alert tone="success">{t("student.exams.submittedNote")}{exam.attempt?.submittedAt ? ` ${t("student.exams.submittedAt", { date: formatDateTime(exam.attempt.submittedAt, locale) })}` : ""}</Alert>
                {exam.resultsPublished ? (
                  <Link href={`/student/results/${exam.id}`} className={buttonClasses("primary", "md", "w-full")}>{t("student.common.viewResult")}</Link>
                ) : (
                  <p className="text-center text-sm text-muted">{t("student.exams.resultsNotYet")}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("student.exams.startTitle")}
        description={t("student.exams.startBody")}
        confirmLabel={t("student.exams.startConfirm")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={begin}
      />
      {paying && <PayDialog exam={exam} onClose={() => { setPaying(false); setError(null); invalidate(studentPaths.myExams); }} />}
    </>
  );
}

export function StudentExamDetail({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = use(params);
  const { t } = useI18n();
  const exams = useApi<{ items: MyExam[] }>(studentPaths.myExams);
  return (
    <QueryState state={exams} skeleton="h-72 w-full">
      {({ items }) => {
        const exam = items.find((e) => e.id === examId);
        return exam ? <DetailBody exam={exam} /> : <Card><EmptyState title={t("errors.EXAM_NOT_FOUND")} /></Card>;
      }}
    </QueryState>
  );
}
