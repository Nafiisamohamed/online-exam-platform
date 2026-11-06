"use client";

/**
 * One published result (GET /api/my/results/:examId): score, grade and the
 * marks per question from the latest published snapshot. Correct answers and
 * accepted answers are shown only when the backend sends them (the lecturer
 * allowed answer review). Unpublished results answer 404.
 */
import { Award, CheckCircle2, Download, MousePointerClick, Percent } from "lucide-react";
import { use } from "react";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { apiUrl } from "@/lib/api/client";
import { studentPaths } from "@/lib/api/student";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { MyResult } from "@/types/student";

function Body({ r }: { r: MyResult }) {
  const { t, locale } = useI18n();
  const optionLabel = (type: string, text: string) =>
    type === "TRUE_FALSE" ? (text.toLowerCase() === "true" ? t("student.attempt.true") : text.toLowerCase() === "false" ? t("student.attempt.false") : text) : text;
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.myResults"), href: "/student/results" }, { label: r.exam.title }]} />}
        title={r.exam.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{r.exam.course.code} · {r.exam.course.name}</span>
            <Badge tone="neutral">{t("student.results.publication", { number: r.publicationNumber })}</Badge>
            {r.publicationNumber > 1 && <Badge tone="warning">{t("student.results.revised")}</Badge>}
          </span>
        }
        actions={<a href={apiUrl(studentPaths.slipPdf(r.exam.id, locale))} download className={buttonClasses("outline")}><Download className="h-4 w-4" aria-hidden />{t("student.results.slip")}</a>}
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        <StatCard emphasis label={t("student.results.score")} value={`${formatNumber(r.totalScore, locale, 2)} / ${formatNumber(r.maxScore, locale, 2)}`} icon={Award} hint={t("student.results.published", { date: formatDateTime(r.publishedAt, locale) })} />
        <StatCard label={t("student.results.grade")} value={r.letterGrade ?? "—"} icon={Percent} hint={formatPercent(r.percentage, locale)} />
        <StatCard label={t("student.results.focusLosses")} value={r.countedFocusLosses} icon={MousePointerClick} />
      </section>
      {!r.answerReviewAllowed && <Alert tone="info" className="mb-4">{t("student.results.reviewNotAllowed")}</Alert>}
      <Card>
        <CardHeader title={t("student.results.questions")} />
        <CardContent>
          <ol className="space-y-4">
            {r.questions.map((q) => (
              <li key={q.position} className="rounded-xl border border-border p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-muted">{q.position}. {t(`admin.exams.questionTypes.${q.type}`)}</span>
                  <Badge tone="navy">{q.awardedMarks === null ? t("student.results.notGraded") : t("student.results.awarded", { awarded: formatNumber(q.awardedMarks, locale, 2), max: formatNumber(q.maxMarks, locale, 2) })}</Badge>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{q.text}</p>
                {q.options.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {q.options.map((o) => {
                      const mine = q.yourAnswer.selectedOptionId === o.id;
                      return (
                        <li key={o.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", mine ? "border-accent bg-accent-soft" : "border-border", o.isCorrect && "border-success/50")}>
                          <span className="flex-1 text-text">{optionLabel(q.type, o.text)}</span>
                          {mine && <Badge tone="sky">{t("student.results.yourAnswer")}</Badge>}
                          {o.isCorrect && <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />{t("student.results.correct")}</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-3">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t("student.results.yourAnswer")}</p>
                    <p className="mt-1 rounded-lg bg-surface-muted px-3 py-2 text-sm whitespace-pre-wrap text-text">{q.yourAnswer.textAnswer || t("student.results.noAnswer")}</p>
                    {q.acceptedAnswers && q.acceptedAnswers.length > 0 && (
                      <p className="mt-2 text-xs text-muted">{t("student.results.acceptedAnswers")}: {q.acceptedAnswers.join(" · ")}</p>
                    )}
                  </div>
                )}
                {q.feedback && <p className="mt-3 rounded-lg border-l-4 border-accent bg-accent-soft px-3 py-2 text-sm text-text"><span className="font-semibold">{t("student.results.feedback")}: </span>{q.feedback}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}

export function StudentResultDetail({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = use(params);
  const result = useApi<{ result: MyResult }>(studentPaths.result(examId));
  return <QueryState state={result} skeleton="h-72 w-full">{({ result: r }) => <Body r={r} />}</QueryState>;
}
