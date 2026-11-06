"use client";

/** Published results only (GET /api/my/results: the latest published snapshot per exam). */
import { Award } from "lucide-react";
import Link from "next/link";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { studentPaths } from "@/lib/api/student";
import { useApi } from "@/lib/api/use-api";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { MyResultItem } from "@/types/student";

export default function StudentResultsPage() {
  const { t, locale } = useI18n();
  const results = useApi<{ items: MyResultItem[] }>(studentPaths.results);
  const columns: Column<MyResultItem>[] = [
    {
      key: "exam",
      header: t("admin.exams.examination"),
      primary: true,
      cell: (r) => (
        <Link href={`/student/results/${r.examId}`} className="group block min-w-0">
          <span className="block font-semibold text-foreground group-hover:text-accent-strong">{r.exam.title}</span>
          <span className="block text-xs text-muted">{r.exam.course.code} · {r.exam.course.name}</span>
        </Link>
      ),
    },
    { key: "score", header: t("student.results.score"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{formatNumber(r.totalScore, locale, 2)} / {formatNumber(r.maxScore, locale, 2)} · {formatPercent(r.percentage, locale)}</span> },
    { key: "grade", header: t("student.results.grade"), cell: (r) => (r.letterGrade ? <Badge tone="navy">{r.letterGrade}</Badge> : "—") },
    {
      key: "published",
      header: t("admin.status"),
      cell: (r) => (
        <span className="flex flex-col items-end gap-1 md:items-start">
          <span className="text-xs text-muted">{t("student.results.published", { date: formatDate(r.publishedAt, locale) })}</span>
          {r.publicationNumber > 1 && <Badge tone="warning">{t("student.results.revised")}</Badge>}
        </span>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.myResults") }]} />}
        title={t("student.results.title")}
        description={t("student.results.subtitle")}
      />
      <Card className="overflow-hidden">
        <QueryState state={results} skeleton="h-40 w-full" className="p-5">
          {({ items }) => (items.length === 0 ? <EmptyState icon={Award} title={t("student.results.empty")} /> : <DataTable columns={columns} rows={items} rowKey={(r) => r.examId} caption={t("student.results.title")} />)}
        </QueryState>
      </Card>
    </>
  );
}
