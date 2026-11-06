"use client";

/** Results overview: the lecturer's published exams (own courses) and their results status. */
import { Award } from "lucide-react";
import Link from "next/link";
import { ResultsBadge } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { useMyCourses } from "@/components/lecturer/course-picker";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { ExamListItem } from "@/types/admin";

export default function ResultsListPage() {
  const { t } = useI18n();
  const exams = useApi<{ items: ExamListItem[] }>(lecturerPaths.exams({ status: "PUBLISHED" }));
  const courses = useMyCourses();
  const own = new Set(courses.data?.items.map((c) => c.id));
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.results") }]} />}
        title={t("lecturer.results.title")}
        description={t("lecturer.results.subtitle")}
      />
      <Card>
        <CardContent>
          <QueryState state={exams} skeleton="h-40 w-full">
            {({ items }) => {
              const rows = courses.data ? items.filter((e) => own.has(e.course.id)) : [];
              return rows.length === 0 ? (
                <EmptyState icon={Award} title={t("lecturer.results.examsEmpty")} className="py-8" />
              ) : (
                <ul className="divide-y divide-border">
                  {rows.map((e) => (
                    <li key={e.id}>
                      <Link href={`/lecturer/results/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 hover:text-accent-strong">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{e.title}</span>
                          <span className="block text-xs text-muted">{e.course.code} · {t("admin.exams.attempts")}: {e.attempts}</span>
                        </span>
                        <ResultsBadge status={e.resultsStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              );
            }}
          </QueryState>
        </CardContent>
      </Card>
    </>
  );
}
