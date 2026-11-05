"use client";

/**
 * Student enrolment: per-course enrolment lists (the API lists enrolments per
 * course, GET /api/courses/:id/enrolments) and the CSV import.
 */
import { GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { EnrolmentImport } from "@/components/admin/enrolment-import";
import { EnrolmentPanel } from "@/components/admin/enrolment-panel";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course } from "@/types/admin";

export default function EnrolmentPage() {
  const { t } = useI18n();
  const courses = useApi<{ items: Course[] }>(paths.courses());
  const [courseId, setCourseId] = useState("");
  const selected = courses.data?.items.find((c) => c.id === courseId);
  // Courses are sorted newest semester first by the API, so the first one is the current semester.
  const latestSemester = useMemo(() => courses.data?.items[0]?.semester ?? "", [courses.data]);

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.students") }]} />}
        title={t("admin.enrolment.title")}
        description={t("admin.enrolment.subtitle")}
      />
      <Tabs defaultValue="course">
        <TabsList className="mb-4">
          <TabsTrigger value="course">{t("admin.enrolment.tabCourse")}</TabsTrigger>
          <TabsTrigger value="import">{t("admin.enrolment.tabImport")}</TabsTrigger>
        </TabsList>
        <TabsContent value="course" className="outline-none">
          <QueryState state={courses} skeleton="h-64 w-full">
            {({ items }) => (
              <Card className="overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <Field label={t("admin.enrolment.chooseCourse")} hint={t("admin.enrolment.chooseCourseHint")} className="max-w-xl">
                    {({ id, describedBy }) => (
                      <Select id={id} aria-describedby={describedBy} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                        <option value="">{t("admin.enrolment.chooseCourse")}</option>
                        {items.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.semester})</option>)}
                      </Select>
                    )}
                  </Field>
                </div>
                {selected ? (
                  <EnrolmentPanel key={selected.id} course={selected} />
                ) : (
                  <EmptyState icon={GraduationCap} title={t("admin.enrolment.chooseCourse")} description={t("admin.enrolment.chooseCourseHint")} />
                )}
              </Card>
            )}
          </QueryState>
        </TabsContent>
        <TabsContent value="import" className="outline-none">
          {courses.data ? <EnrolmentImport defaultSemester={latestSemester} /> : <QueryState state={courses}>{() => null}</QueryState>}
        </TabsContent>
      </Tabs>
    </>
  );
}
