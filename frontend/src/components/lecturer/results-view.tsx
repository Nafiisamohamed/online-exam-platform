"use client";

/**
 * Results of one exam (GET /api/exams/:id/results): what blocks publishing,
 * the students (absent ones included) with their current and published
 * grades, and the permanent publication history.
 * - Publish (POST …/results/publish) is offered only when the server says
 *   canPublish; from the second publication a reason is required.
 * - Reopen (POST …/results/reopen) needs a reason; students keep seeing the
 *   last published snapshot meanwhile.
 * Notifications and the grade snapshots are created by the server.
 */
import { Download, RotateCcw, Send } from "lucide-react";
import { use, useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { apiUrl } from "@/lib/api/client";
import { lecturerPaths, publishResults, reopenResults } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { ExamResults, GradingStatus, ResultScore } from "@/types/lecturer";

type Row = ExamResults["students"][number];

function Score({ s }: { s: ResultScore | null }) {
  const { locale } = useI18n();
  if (!s) return <span className="text-subtle">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatNumber(s.totalScore, locale, 2)}/{formatNumber(s.maxScore, locale, 2)} · {formatPercent(s.percentage, locale)}
      {s.letterGrade && <Badge tone="navy" className="ml-1.5">{s.letterGrade}</Badge>}
    </span>
  );
}

function ReasonDialog({ mode, examId, republish, onClose }: { mode: "publish" | "reopen"; examId: string; republish: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const needsReason = mode === "reopen" || republish;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (needsReason && !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "publish") {
        const res = await publishResults(examId, reason.trim() || undefined);
        toast(t("lecturer.results.publishedToast", { number: res.publicationNumber, students: res.notifiedStudents }));
      } else {
        await reopenResults(examId, reason.trim());
        toast(t("lecturer.results.reopenedToast"));
      }
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
      title={mode === "publish" ? t("lecturer.results.publishTitle") : t("lecturer.results.reopenTitle")}
      description={mode === "publish" ? (republish ? t("lecturer.results.republishBody") : t("lecturer.results.publishBody")) : t("lecturer.results.reopenBody")}
      closeLabel={t("common.cancel")}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="reason-form" loading={busy}>{mode === "publish" ? (republish ? t("lecturer.results.republish") : t("lecturer.results.publish")) : t("lecturer.results.reopen")}</Button>
        </>
      }
    >
      <form id="reason-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />
        {(needsReason || mode === "publish") && (
          <Field label={t("lecturer.results.reason")} hint={mode === "reopen" ? t("lecturer.results.reopenReasonHint") : t("lecturer.results.reasonHint")} error={touched && needsReason && !reason.trim() ? t("validation.required") : undefined} required={needsReason}>
            {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} />}
          </Field>
        )}
      </form>
    </Modal>
  );
}

function ResultsBody({ r, examId }: { r: ExamResults; examId: string }) {
  const { t, locale } = useI18n();
  const [dialog, setDialog] = useState<"publish" | "reopen" | null>(null);
  const published = r.exam.resultsStatus === "PUBLISHED";
  const republish = r.publications.length > 0;
  const ungraded = Object.entries(r.blockers.ungraded) as [GradingStatus, number][];

  const columns: Column<Row>[] = [
    {
      key: "student",
      header: t("lecturer.grading.student"),
      primary: true,
      cell: (s) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-foreground">{s.student.fullName}</span>
          <span className="block text-xs text-muted">{s.student.studentNumber}{s.enrolment === "DROPPED" ? ` · ${t("admin.enrolment.statusDROPPED")}` : ""}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.status"),
      cell: (s) => <Badge tone={s.status === "SUBMITTED" ? "success" : s.status === "IN_PROGRESS" ? "warning" : "neutral"}>{s.status === "ABSENT" ? t("lecturer.results.absent") : s.status === "IN_PROGRESS" ? t("lecturer.results.inProgress") : t("lecturer.results.submitted")}</Badge>,
    },
    { key: "working", header: t("lecturer.results.working"), cell: (s) => <Score s={s.working} /> },
    { key: "published", header: t("lecturer.results.published"), cell: (s) => <Score s={s.published} /> },
    { key: "focus", header: t("lecturer.results.focus"), align: "right", cell: (s) => <span className="tabular-nums">{s.countedFocusLosses ?? "—"}</span>, className: "hidden lg:table-cell" },
    { key: "submission", header: t("lecturer.results.submission"), cell: (s) => (s.submissionType ? (s.submissionType === "MANUAL" ? t("lecturer.results.manual") : t("lecturer.results.auto")) : "—"), className: "hidden xl:table-cell" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.results"), href: "/lecturer/results" }, { label: r.exam.title }]} />}
        title={r.exam.title}
        description={<Badge tone={published ? "success" : r.exam.resultsStatus === "REOPENED" ? "warning" : "neutral"}>{t(`lecturer.results.status.${r.exam.resultsStatus}`)}</Badge>}
        actions={
          <>
            <a href={apiUrl(lecturerPaths.gradesCsv(examId, locale))} download className={buttonClasses("outline")}><Download className="h-4 w-4" aria-hidden />{t("lecturer.results.downloadCsv")}</a>
            {published ? (
              <Button variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setDialog("reopen")}>{t("lecturer.results.reopen")}</Button>
            ) : (
              <Button leftIcon={<Send className="h-4 w-4" />} onClick={() => setDialog("publish")} disabled={!r.canPublish}>{republish ? t("lecturer.results.republish") : t("lecturer.results.publish")}</Button>
            )}
          </>
        }
      />
      <div className="mb-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title={t("lecturer.results.readiness")} />
          <CardContent className="space-y-2 pt-3">
            {published ? (
              <Alert tone="info">{t("lecturer.results.alreadyPublished")}</Alert>
            ) : r.canPublish ? (
              <Alert tone="success">{t("lecturer.results.ready")}</Alert>
            ) : (
              <>
                {r.blockers.inProgress > 0 && <Alert tone="warning">{t("lecturer.results.blockedInProgress", { count: r.blockers.inProgress })}</Alert>}
                {ungraded.map(([status, count]) => <Alert key={status} tone="warning">{t("lecturer.results.blockedUngraded", { count, status: t(`lecturer.grading.statuses.${status}`) })}</Alert>)}
                {r.blockers.submitted === 0 && <Alert tone="warning">{t("lecturer.results.blockedNoSubmissions")}</Alert>}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("lecturer.results.history")} />
          <CardContent className="pt-3">
            {r.publications.length === 0 ? (
              <p className="text-sm text-muted">{t("lecturer.results.historyEmpty")}</p>
            ) : (
              <ol className="space-y-3">
                {[...r.publications].reverse().map((p) => (
                  <li key={p.number} className="rounded-xl border border-border px-4 py-3 text-sm">
                    <span className="font-semibold text-foreground">{t("lecturer.results.publication", { number: p.number })}</span>
                    <span className="block text-xs text-muted">{t("lecturer.results.publishedBy", { name: p.publishedBy, date: formatDateTime(p.publishedAt, locale) })}</span>
                    {p.reason && <span className="mt-1 block text-text">{p.reason}</span>}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <CardHeader title={t("lecturer.results.students")} className="pb-4" />
        <DataTable columns={columns} rows={r.students} rowKey={(s) => s.student.id} emptyTitle={t("table.noRows")} caption={t("lecturer.results.students")} />
      </Card>
      {dialog && <ReasonDialog mode={dialog} examId={examId} republish={republish} onClose={() => setDialog(null)} />}
    </>
  );
}

export function ResultsView({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = use(params);
  const results = useApi<ExamResults>(lecturerPaths.results(examId));
  return <QueryState state={results} skeleton="h-72 w-full">{(r) => <ResultsBody r={r} examId={examId} />}</QueryState>;
}
