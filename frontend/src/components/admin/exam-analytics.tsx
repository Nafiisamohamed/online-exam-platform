"use client";

/**
 * Statistics and question analysis of one examination (GET /api/exams/:id/analytics).
 *
 * The backend applies the rules and this view only shows its answers:
 * - when fewer than `rules.minStudents` (5) students answered a question,
 *   difficulty and discrimination are null and the question is flagged
 *   NOT_ENOUGH_DATA, shown here as "Not enough data", never as 0;
 * - LOW_CORRECT_RATE / HIGH_CORRECT_RATE flags come from the server too.
 */
import { Award, TrendingDown, TrendingUp, Users } from "lucide-react";
import { BarChartView } from "@/components/charts/charts";
import { ChartCard } from "@/components/charts/chart-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatNumber, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { ExamAnalytics as Analytics, QuestionAnalytics } from "@/types/admin";
import { QueryState } from "./query-state";

/** "0–9", "10–19" … "90–100" band labels for the 10-band distribution (bands end at 9.99, 19.99…). */
export const bandLabel = (b: { from: number; to: number }) => `${b.from}–${Math.floor(b.to)}`;

export function ExamAnalyticsView({ examId }: { examId: string }) {
  const analytics = useApi<Analytics>(paths.examAnalytics(examId));
  return <QueryState state={analytics} skeleton="h-80 w-full">{(a) => <AnalyticsBody a={a} />}</QueryState>;
}

function AnalyticsBody({ a }: { a: Analytics }) {
  const { t, locale } = useI18n();
  const s = a.statistics;
  const notEnough = (
    <Badge tone="neutral" title={t("admin.reports.notEnoughDataHint", { min: a.rules.minStudents })}>{t("admin.reports.notEnoughData")}</Badge>
  );

  const columns: Column<QuestionAnalytics>[] = [
    {
      key: "question",
      header: t("admin.reports.question"),
      primary: true,
      cell: (q) => (
        <span className="block min-w-0">
          <span className="line-clamp-2 font-medium text-foreground">{q.text || "—"}</span>
          <span className="text-xs text-muted">{[q.topic, q.difficulty && t(`admin.exams.difficulty.${q.difficulty}`)].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    },
    { key: "type", header: t("admin.reports.type"), cell: (q) => <span className="whitespace-nowrap">{t(`admin.exams.questionTypes.${q.type}`)}</span>, className: "hidden lg:table-cell" },
    { key: "answered", header: t("admin.reports.answered"), align: "right", cell: (q) => <span className="tabular-nums">{q.answered}</span> },
    { key: "difficulty", header: t("admin.reports.difficultyIndex"), align: "right", cell: (q) => (q.difficultyIndex === null ? notEnough : <span className="tabular-nums">{formatPercent(q.difficultyIndex, locale)}</span>) },
    { key: "discrimination", header: t("admin.reports.discrimination"), align: "right", cell: (q) => (q.discrimination === null ? notEnough : <span className="tabular-nums">{formatNumber(q.discrimination, locale, 2)}</span>) },
    {
      key: "flags",
      header: t("admin.reports.flags"),
      cell: (q) => (
        <span className="flex flex-wrap justify-end gap-1 md:justify-start">
          {q.flags.includes("LOW_CORRECT_RATE") && <Badge tone="danger">{t("admin.reports.lowCorrect")}</Badge>}
          {q.flags.includes("HIGH_CORRECT_RATE") && <Badge tone="warning">{t("admin.reports.highCorrect")}</Badge>}
          {!q.flags.some((f) => f !== "NOT_ENOUGH_DATA") && <span className="text-subtle">—</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard emphasis label={t("admin.reports.gradedStudents")} value={s.students} icon={Users} />
        <StatCard label={t("admin.reports.average")} value={formatPercent(s.average, locale)} icon={Award} />
        <StatCard label={t("admin.reports.highest")} value={formatPercent(s.highest, locale)} icon={TrendingUp} />
        <StatCard label={t("admin.reports.lowest")} value={formatPercent(s.lowest, locale)} icon={TrendingDown} />
      </section>
      {s.students === 0 ? (
        <Card><EmptyState title={t("admin.reports.noAttempts")} /></Card>
      ) : (
        <>
          <ChartCard title={t("admin.reports.scoreDistribution")} description={t("admin.reports.scoreDistributionHint")}>
            <BarChartView data={s.distribution.map((b) => ({ band: bandLabel(b), count: b.count }))} xKey="band" series={[{ key: "count", label: t("dashboard.charts.students") }]} />
          </ChartCard>
          <Card className="overflow-hidden">
            <CardHeader title={t("admin.reports.questionsTitle")} className="pb-4" />
            <div className="px-5 pb-4 sm:px-6">
              <Alert tone="info">{t("admin.reports.notEnoughDataHint", { min: a.rules.minStudents })}</Alert>
            </div>
            <DataTable columns={columns} rows={a.questions} rowKey={(q) => q.questionVersionId} emptyTitle={t("admin.reports.noAttempts")} caption={t("admin.reports.questionsTitle")} />
          </Card>
        </>
      )}
    </div>
  );
}
