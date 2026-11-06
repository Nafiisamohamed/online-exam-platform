"use client";

/** The lecturer's courses (GET /api/courses, scoped to the lecturer by the server). */
import { CourseTable } from "@/components/admin/course-table";
import { PageHeader } from "@/components/layout/app-shell";
import { WithMyCourses } from "@/components/lecturer/course-picker";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n";

export default function LecturerCoursesPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.courses") }]} />}
        title={t("lecturer.courses.title")}
        description={t("lecturer.courses.subtitle")}
      />
      <WithMyCourses>
        {(courses) => (
          <Card className="overflow-hidden">
            <CourseTable rows={courses} hideLecturer basePath="/lecturer/courses" />
          </Card>
        )}
      </WithMyCourses>
    </>
  );
}
