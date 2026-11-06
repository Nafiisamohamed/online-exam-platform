"use client";

/**
 * Lecturer analytics: the shared reports (components/admin/reports.tsx) for
 * the lecturer's own courses. The server scopes /analytics/dashboard to them.
 * "?exam=<id>" opens the per-exam analysis directly (link from the exam page).
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { ExamReport, InstitutionReport } from "@/components/admin/reports";
import { PageHeader } from "@/components/layout/app-shell";
import { WithMyCourses } from "@/components/lecturer/course-picker";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Skeleton } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course } from "@/types/admin";

function AnalyticsTabs({ courses }: { courses: Course[] }) {
  const { t } = useI18n();
  const examId = useSearchParams().get("exam") ?? "";
  const own = useMemo(() => new Set(courses.map((c) => c.id)), [courses]);
  return (
    <Tabs defaultValue={examId ? "exam" : "courses"}>
      <TabsList className="mb-4">
        <TabsTrigger value="courses">{t("lecturer.courses.title")}</TabsTrigger>
        <TabsTrigger value="exam">{t("admin.reports.tabExam")}</TabsTrigger>
      </TabsList>
      <TabsContent value="courses" className="outline-none"><InstitutionReport scope="lecturer" /></TabsContent>
      <TabsContent value="exam" className="outline-none"><ExamReport initialExamId={examId} ownCourseIds={own} /></TabsContent>
    </Tabs>
  );
}

export default function LecturerAnalyticsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.analytics") }]} />}
        title={t("lecturer.analytics.title")}
        description={t("lecturer.analytics.subtitle")}
      />
      <Alert tone="info" className="mb-4">{t("lecturer.analytics.exportNote")}</Alert>
      <WithMyCourses>
        {(courses) => (
          <Suspense fallback={<Skeleton className="h-72 w-full" />}>
            <AnalyticsTabs courses={courses} />
          </Suspense>
        )}
      </WithMyCourses>
    </>
  );
}
