"use client";

/** The student's examinations (GET /api/my/exams), grouped as upcoming, open / in progress, and completed. */
import { CalendarClock } from "lucide-react";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { ExamCard } from "@/components/student/exam-card";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { useServerNow } from "@/hooks/use-server-now";
import { studentPaths } from "@/lib/api/student";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import { groupMyExams } from "@/lib/student/my-exams";
import type { MyExam } from "@/types/student";

export default function StudentExamsPage() {
  const { t } = useI18n();
  const exams = useApi<{ items: MyExam[] }>(studentPaths.myExams);
  const serverNow = useServerNow();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.myExams") }]} />}
        title={t("student.exams.title")}
        description={t("student.exams.subtitle")}
      />
      <QueryState state={exams} skeleton="h-64 w-full">
        {({ items }) => {
          const g = groupMyExams(items);
          const tabs = [
            { key: "active", label: t("student.exams.tabActive"), rows: g.active },
            { key: "upcoming", label: t("student.exams.tabUpcoming"), rows: g.upcoming },
            { key: "done", label: t("student.exams.tabDone"), rows: g.done },
          ];
          return (
            <Tabs defaultValue={g.active.length ? "active" : "upcoming"}>
              <TabsList className="mb-4">
                {tabs.map((tab) => <TabsTrigger key={tab.key} value={tab.key}>{tab.label} ({tab.rows.length})</TabsTrigger>)}
              </TabsList>
              {tabs.map((tab) => (
                <TabsContent key={tab.key} value={tab.key} className="outline-none">
                  {tab.rows.length === 0 ? (
                    <Card><EmptyState icon={CalendarClock} title={t("student.exams.empty")} /></Card>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">{tab.rows.map((e) => <ExamCard key={e.id} exam={e} serverNow={serverNow} />)}</div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          );
        }}
      </QueryState>
    </>
  );
}
