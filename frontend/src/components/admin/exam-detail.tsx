"use client";

/**
 * One examination, read-only (GET /api/exams/:id): settings, question rules,
 * schedules and its analytics. The registrar can download the grades CSV
 * (GET /api/exams/:id/grades.csv, an admin endpoint); nothing here edits the exam.
 */
import { BarChart3, Download, Lock } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { useNow } from "@/hooks/use-now";
import { examState } from "@/lib/admin/exam-state";
import { paths } from "@/lib/api/admin";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course, ExamDetail as Exam } from "@/types/admin";
import { DetailList, ExamStateBadge, ResultsBadge, ScheduleBadge } from "./admin-ui";
import { ExamAnalyticsView } from "./exam-analytics";
import { QueryState } from "./query-state";

function ExamView({ exam }: { exam: Exam }) {
  const { t, locale } = useI18n();
  const now = useNow();
  const course = useApi<{ course: Course }>(paths.course(exam.course.id));
  const yesNo = (v: boolean) => (v ? t("common.yes") : t("common.no"));
  const state = examState({ status: exam.status, schedules: exam.schedules.filter((s) => s.status === "APPROVED" || s.status === "REQUESTED") }, now);

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.examOversight"), href: "/admin/exams" }, { label: exam.title }]} />}
        title={exam.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ExamStateBadge state={state} />
            <ResultsBadge status={exam.resultsStatus} />
            <span className="text-sm text-muted">{exam.course.code} · {exam.course.name} ({exam.course.semester})</span>
          </span>
        }
        actions={
          <>
            <a href="#analytics" className={buttonClasses("secondary")}><BarChart3 className="h-4 w-4" aria-hidden />{t("admin.exams.analytics")}</a>
            {exam.status === "PUBLISHED" && (
              <a href={apiUrl(paths.gradesCsv(exam.id, locale))} className={buttonClasses("outline")} download>
                <Download className="h-4 w-4" aria-hidden />{t("admin.exams.downloadGrades")}
              </a>
            )}
          </>
        }
      />
      <Alert tone="info" className="mb-6">
        <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden />{t("admin.exams.readOnlyNote")}</span>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("admin.details")} />
          <CardContent className="pt-2">
            <DetailList
              items={[
                { label: t("admin.exams.course"), value: <Link className="hover:text-accent-strong" href={`/admin/courses/${exam.course.id}`}>{exam.course.code} · {exam.course.name}</Link> },
                { label: t("admin.exams.lecturer"), value: course.data?.course.lecturer.fullName ?? "—" },
                { label: t("admin.exams.enrolled"), value: course.data?.course.activeStudents ?? "—" },
                { label: t("admin.exams.totalQuestions"), value: exam.totalQuestions },
                { label: t("admin.exams.totalMarks"), value: formatNumber(exam.totalMarks, locale, 2) },
                { label: t("admin.exams.fee"), value: exam.feeAmount ? `${formatNumber(exam.feeAmount, locale, 2)} ${exam.feeCurrency}` : t("admin.exams.free") },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("admin.exams.settings")} />
          <CardContent className="pt-2">
            <DetailList
              items={[
                { label: t("admin.exams.shuffleQuestions"), value: yesNo(exam.shuffleQuestions) },
                { label: t("admin.exams.shuffleOptions"), value: yesNo(exam.shuffleOptions) },
                { label: t("admin.exams.answerReview"), value: yesNo(exam.allowAnswerReview) },
                { label: t("admin.exams.secondGrader"), value: exam.secondGrader?.fullName ?? t("admin.none") },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("admin.exams.rules")} />
          <CardContent className="pt-3">
            {exam.rules.length === 0 ? (
              <p className="text-sm text-muted">{t("admin.exams.rulesEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {exam.rules.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-text">
                    {t("admin.exams.ruleLine", {
                      count: r.questionCount,
                      type: t(`admin.exams.questionTypes.${r.questionType}`),
                      difficulty: t(`admin.exams.difficulty.${r.difficulty}`),
                      marks: formatNumber(r.marksPerQuestion, locale, 2),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("admin.exams.schedules")} />
          <CardContent className="pt-3">
            {exam.schedules.length === 0 ? (
              <p className="text-sm text-muted">{t("admin.exams.schedulesEmpty")}</p>
            ) : (
              <ul className="space-y-3">
                {exam.schedules.map((s) => (
                  <li key={s.id} className="rounded-xl border border-border px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{formatDateTime(s.windowStart, locale)} – {formatDateTime(s.windowEnd, locale)}</span>
                      <ScheduleBadge status={s.status} />
                    </div>
                    <p className="mt-1 text-muted">{t("admin.exams.duration")}: {t("admin.minutes", { count: s.durationMinutes })}</p>
                    <p className="text-muted">{t("admin.exams.rooms")}: {s.rooms.length ? s.rooms.map((r) => `${r.name} (${r.building})`).join(", ") : t("admin.exams.anyRoom")}</p>
                    <p className="text-muted">{t("admin.exams.invigilators")}: {s.invigilators.length ? s.invigilators.map((i) => i.fullName).join(", ") : t("admin.none")}</p>
                    {s.rejectionReason && <p className="mt-1 text-danger">{t("admin.exams.rejectionReason", { reason: s.rejectionReason })}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section id="analytics" className="mt-8 scroll-mt-24">
        <h2 className="mb-4 text-lg font-semibold text-foreground">{t("nav.analytics")}</h2>
        {exam.status === "PUBLISHED" ? <ExamAnalyticsView examId={exam.id} /> : <Card><EmptyState title={t("admin.reports.noAttempts")} /></Card>}
      </section>
    </>
  );
}

export function ExamDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const exam = useApi<{ exam: Exam }>(paths.exam(id));
  return <QueryState state={exam} skeleton="h-72 w-full">{({ exam: e }) => <ExamView exam={e} />}</QueryState>;
}
