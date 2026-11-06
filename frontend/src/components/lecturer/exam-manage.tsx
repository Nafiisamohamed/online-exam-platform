"use client";

/**
 * One examination for its lecturer (GET /api/exams/:id):
 * - settings (PATCH; shuffling and fee fixed after publishing);
 * - question rules (PUT /rules, DRAFT only), a sample draw (GET /preview) and publishing (POST /publish);
 * - the schedule: request one (POST /schedules) and cancel a waiting request;
 *   approval belongs to the registrar, so it is not offered here;
 * - links to grading, results and analytics.
 * A lecturer who is only the blind second grader sees a short note and the grading link.
 */
import { BarChart3, CalendarPlus, ClipboardCheck, Eye, Award, PencilLine, Send, XCircle, Lock } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { DetailList, ExamStateBadge, FormError, ResultsBadge, ScheduleBadge } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { useNow } from "@/hooks/use-now";
import { examState } from "@/lib/admin/exam-state";
import { cancelSchedule, lecturerPaths, publishExam, setExamRules } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { BankSummaryRow, LecturerExam, Topic } from "@/types/lecturer";
import { useMyCourses } from "./course-picker";
import { PreviewDialog, ScheduleDialog, SettingsDialog } from "./exam-dialogs";
import { RulesEditor, rulesComplete, toRuleInputs, type RuleDraft } from "./rules-editor";

function RulesCard({ exam }: { exam: LecturerExam }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const draft = exam.status === "DRAFT";
  const summary = useApi<{ items: BankSummaryRow[] }>(draft ? lecturerPaths.bankSummary(exam.course.id) : null);
  const topics = useApi<{ items: Topic[] }>(draft ? lecturerPaths.topics(exam.course.id) : null);
  const [rules, setRules] = useState<RuleDraft[]>(() =>
    exam.rules.map((r) => ({ questionType: r.questionType, difficulty: r.difficulty, marksPerQuestion: String(r.marksPerQuestion), questionCount: String(r.questionCount), topicIds: r.topics?.map((x) => x.id) ?? [] })),
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setExamRules(exam.id, toRuleInputs(rules));
      toast(t("lecturer.exams.rulesSaved"));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t("lecturer.exams.rules")} description={draft ? t("lecturer.exams.rulesHint") : t("lecturer.exams.lockedNote")} />
      <CardContent className="space-y-4">
        {draft ? (
          <>
            <RulesEditor rules={rules} onChange={setRules} summary={summary.data?.items ?? []} topics={topics.data?.items ?? []} />
            <FormError error={error} />
            <div className="flex justify-end">
              <Button onClick={save} loading={busy} disabled={rules.length === 0 || !rulesComplete(rules)}>{t("lecturer.exams.saveRules")}</Button>
            </div>
          </>
        ) : exam.rules.length === 0 ? (
          <p className="text-sm text-muted">{t("admin.exams.rulesEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {exam.rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm">
                <span className="text-text">
                  {t("admin.exams.ruleLine", { count: r.questionCount, type: t(`admin.exams.questionTypes.${r.questionType}`), difficulty: t(`admin.exams.difficulty.${r.difficulty}`), marks: formatNumber(r.marksPerQuestion, locale, 2) })}
                  {r.topics?.length ? <span className="text-muted"> · {r.topics.map((x) => x.name).join(", ")}</span> : null}
                </span>
                <span className="text-xs text-muted">{t("lecturer.exams.available", { count: r.available ?? 0 })}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ManageView({ exam }: { exam: LecturerExam }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const now = useNow();
  const courses = useMyCourses();
  const [dialog, setDialog] = useState<"settings" | "schedule" | "preview" | "publish" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const isOwner = courses.data?.items.some((c) => c.id === exam.course.id) ?? false;
  const open = exam.schedules.find((s) => s.status === "REQUESTED" || s.status === "APPROVED");
  const state = examState({ status: exam.status, schedules: exam.schedules.filter((s) => s.status === "REQUESTED" || s.status === "APPROVED") }, now);
  const yesNo = (v: boolean) => (v ? t("common.yes") : t("common.no"));

  const act = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast(message);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  const crumbs = <Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.exams"), href: "/lecturer/exams" }, { label: exam.title }]} />;
  const badges = (
    <span className="flex flex-wrap items-center gap-2">
      <Badge tone={exam.status === "PUBLISHED" ? "navy" : "neutral"}>{t(`lecturer.exams.status.${exam.status}`)}</Badge>
      <ExamStateBadge state={state} />
      <ResultsBadge status={exam.resultsStatus} />
      <span className="text-sm text-muted">{exam.course.code} · {exam.course.name} ({exam.course.semester})</span>
    </span>
  );

  if (courses.data && !isOwner) {
    return (
      <>
        <PageHeader eyebrow={crumbs} title={exam.title} description={badges} />
        <Alert tone="info" className="mb-4">{t("lecturer.exams.secondGraderView")}</Alert>
        <Link href={`/lecturer/grading/${exam.id}`} className={buttonClasses("primary")}><ClipboardCheck className="h-4 w-4" aria-hidden />{t("lecturer.exams.grading")}</Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={crumbs}
        title={exam.title}
        description={badges}
        actions={
          <>
            <Button variant="outline" leftIcon={<PencilLine className="h-4 w-4" />} onClick={() => setDialog("settings")}>{t("lecturer.exams.editSettings")}</Button>
            {exam.rules.length > 0 && <Button variant="secondary" leftIcon={<Eye className="h-4 w-4" />} onClick={() => setDialog("preview")}>{t("lecturer.exams.preview")}</Button>}
            {exam.status === "DRAFT" && <Button leftIcon={<Send className="h-4 w-4" />} onClick={() => setDialog("publish")} disabled={exam.rules.length === 0}>{t("lecturer.exams.publish")}</Button>}
          </>
        }
      />
      {error ? <div className="mb-4"><FormError error={error} /></div> : null}
      {exam.status === "PUBLISHED" && <Alert tone="info" className="mb-6"><span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden />{t("lecturer.exams.lockedNote")}</span></Alert>}

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title={t("lecturer.exams.settings")} />
          <CardContent className="pt-2">
            <DetailList
              items={[
                { label: t("lecturer.exams.instructions"), value: <span className="whitespace-pre-wrap">{exam.instructions || "—"}</span> },
                { label: t("admin.exams.totalQuestions"), value: exam.totalQuestions },
                { label: t("admin.exams.totalMarks"), value: formatNumber(exam.totalMarks, locale, 2) },
                { label: t("admin.exams.shuffleQuestions"), value: yesNo(exam.shuffleQuestions) },
                { label: t("admin.exams.shuffleOptions"), value: yesNo(exam.shuffleOptions) },
                { label: t("admin.exams.answerReview"), value: yesNo(exam.allowAnswerReview) },
                { label: t("admin.exams.fee"), value: exam.feeAmount ? `${formatNumber(exam.feeAmount, locale, 2)} ${exam.feeCurrency}` : t("admin.exams.free") },
                { label: t("admin.exams.secondGrader"), value: exam.secondGrader?.fullName ?? t("admin.none") },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={t("lecturer.exams.schedule")}
            action={
              !open ? (
                <Button size="sm" leftIcon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setDialog("schedule")}>{t("lecturer.exams.requestSchedule")}</Button>
              ) : open.status === "REQUESTED" ? (
                <Button size="sm" variant="outline" leftIcon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setDialog("cancel")}>{t("lecturer.exams.cancelRequest")}</Button>
              ) : null
            }
          />
          <CardContent className="pt-3">
            {exam.schedules.length === 0 ? (
              <p className="text-sm text-muted">{t("lecturer.exams.noSchedule")}</p>
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

      <div className="mt-6"><RulesCard key={`${exam.status}-${exam.updatedAt}`} exam={exam} /></div>

      {exam.status === "PUBLISHED" && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/lecturer/grading/${exam.id}`} className={buttonClasses("secondary")}><ClipboardCheck className="h-4 w-4" aria-hidden />{t("lecturer.exams.grading")}</Link>
          <Link href={`/lecturer/results/${exam.id}`} className={buttonClasses("secondary")}><Award className="h-4 w-4" aria-hidden />{t("lecturer.exams.results")}</Link>
          <Link href={`/lecturer/analytics?exam=${exam.id}`} className={buttonClasses("outline")}><BarChart3 className="h-4 w-4" aria-hidden />{t("lecturer.exams.analytics")}</Link>
        </div>
      )}

      {dialog === "settings" && <SettingsDialog exam={exam} onClose={() => setDialog(null)} />}
      {dialog === "schedule" && <ScheduleDialog examId={exam.id} onClose={() => setDialog(null)} />}
      {dialog === "preview" && <PreviewDialog examId={exam.id} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === "publish"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("lecturer.exams.publishTitle")}
        description={t("lecturer.exams.publishBody")}
        confirmLabel={t("lecturer.exams.publish")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => act(() => publishExam(exam.id), t("lecturer.exams.publishedToast"))}
      />
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("lecturer.exams.cancelTitle")}
        description={t("lecturer.exams.cancelBody")}
        confirmLabel={t("lecturer.exams.cancelRequest")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={busy}
        onConfirm={() => open && act(() => cancelSchedule(open.id), t("lecturer.exams.cancelledToast"))}
      />
    </>
  );
}

export function ExamManage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const exam = useApi<{ exam: LecturerExam }>(lecturerPaths.exam(id));
  return <QueryState state={exam} skeleton="h-72 w-full">{({ exam: e }) => <ManageView exam={e} />}</QueryState>;
}
