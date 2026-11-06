"use client";

/** Grading overview: the lecturer's exams with answers to grade (see GradingList). */
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { GradingList } from "@/components/lecturer/grading-list";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { ExamListItem } from "@/types/admin";

export default function GradingPage() {
  const { t } = useI18n();
  const exams = useApi<{ items: ExamListItem[] }>(lecturerPaths.exams());
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.grading") }]} />}
        title={t("lecturer.grading.title")}
        description={t("lecturer.grading.subtitle")}
      />
      <Card>
        <CardContent>
          <QueryState state={exams} skeleton="h-40 w-full">{({ items }) => <GradingList exams={items} />}</QueryState>
        </CardContent>
      </Card>
    </>
  );
}
