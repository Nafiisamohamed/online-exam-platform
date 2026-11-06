"use client";

/**
 * The grading queue of one exam (GET /api/exams/:id/grading). By default the
 * server returns what still needs this grader's marks; any status can be
 * listed instead (e.g. auto-graded answers, to review or regrade them). The
 * blind second grader only ever gets essays, with anonymous codes.
 */
import { ClipboardCheck } from "lucide-react";
import { use, useState } from "react";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { GRADING_STATUSES, type GradingQueue as Queue, type GradingStatus } from "@/types/lecturer";
import { GradingPanel, studentLabel } from "./grading-panel";

type Item = Queue["items"][number];

const tone = (s: Item["gradingStatus"]): BadgeTone =>
  s === "GRADED" || s === "AUTO_CORRECT" || s === "MARKED_BY_YOU" ? "success" : s === "DISCREPANCY" ? "danger" : s === "AUTO_INCORRECT" || s === "NOT_ANSWERED" ? "neutral" : "warning";

export function GradingQueueView({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = use(params);
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<GradingStatus | "">("");
  const [open, setOpen] = useState<string | null>(null);
  const queue = useApi<Queue>(lecturerPaths.grading(examId, status || undefined), { keepPrevious: true });

  const columns: Column<Item>[] = [
    {
      key: "question",
      header: t("admin.reports.question"),
      primary: true,
      cell: (i) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-foreground">{t("lecturer.grading.questionNumber", { number: i.questionPosition })} · {t(`admin.exams.questionTypes.${i.type}`)}</span>
          <span className="line-clamp-2 text-sm text-muted">{i.questionText}</span>
        </span>
      ),
    },
    { key: "student", header: t("lecturer.grading.student"), cell: (i) => studentLabel(i.student, t) },
    { key: "marks", header: t("lecturer.common.marks"), align: "right", cell: (i) => <span className="tabular-nums">{i.myMark != null ? `${formatNumber(i.myMark, locale, 2)} / ` : ""}{formatNumber(i.maxMarks, locale, 2)}</span> },
    { key: "status", header: t("admin.status"), cell: (i) => (i.gradingStatus ? <Badge tone={tone(i.gradingStatus)}>{t(`lecturer.grading.statuses.${i.gradingStatus}`)}</Badge> : "—") },
    { key: "action", header: <span className="sr-only">{t("table.actions")}</span>, align: "right", cell: (i) => <Button size="sm" variant="secondary" onClick={() => setOpen(i.answerId)}>{t("lecturer.grading.grade")}</Button> },
  ];

  return (
    <QueryState state={queue} skeleton="h-72 w-full">
      {(q) => (
        <>
          <PageHeader
            eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.grading"), href: "/lecturer/grading" }, { label: q.exam.title }]} />}
            title={t("lecturer.grading.queueTitle", { title: q.exam.title })}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={q.remaining ? "warning" : "success"}>{q.remaining ? t("lecturer.grading.remaining", { count: q.remaining }) : t("lecturer.grading.allDone")}</Badge>
                {q.role === "SECOND" && <Badge tone="sky">{t("lecturer.common.secondGrader")}</Badge>}
              </span>
            }
          />
          {q.role === "SECOND" && <Alert tone="info" className="mb-4">{t("lecturer.grading.blindNote")}</Alert>}
          {q.exam.resultsStatus === "PUBLISHED" && <Alert tone="info" className="mb-4">{t("lecturer.grading.publishedLocked")}</Alert>}
          {q.counts && (
            <div className="mb-4 flex flex-wrap gap-2">
              {GRADING_STATUSES.filter((s) => q.counts?.[s]).map((s) => <Badge key={s} tone={tone(s)}>{t(`lecturer.grading.statuses.${s}`)}: {q.counts?.[s]}</Badge>)}
            </div>
          )}
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <Field label={t("lecturer.grading.filter")} className="max-w-xs">
                {({ id }) => (
                  <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as GradingStatus | "")}>
                    <option value="">{t("lecturer.grading.needsWork")}</option>
                    {(q.role === "FIRST" ? GRADING_STATUSES : []).map((s) => <option key={s} value={s}>{t(`lecturer.grading.statuses.${s}`)}</option>)}
                  </Select>
                )}
              </Field>
            </div>
            {q.items.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title={status ? t("lecturer.grading.queueEmpty") : t("lecturer.overview.gradingEmpty")} />
            ) : (
              <DataTable columns={columns} rows={q.items} rowKey={(i) => i.answerId} caption={t("lecturer.grading.title")} />
            )}
          </Card>
          {open && <GradingPanel examId={examId} answerId={open} onClose={() => setOpen(null)} />}
        </>
      )}
    </QueryState>
  );
}
