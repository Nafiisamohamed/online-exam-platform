"use client";

/**
 * One course (GET /api/courses/:id): details, its students (enrol / drop) and
 * its examinations (GET /api/exams?courseId=…). Editing covers the name,
 * faculty and lecturer, the fields the API lets the registrar change.
 */
import { PencilLine } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { useNow } from "@/hooks/use-now";
import { paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course, ExamListItem } from "@/types/admin";
import { DetailList } from "./admin-ui";
import { CourseModal } from "./course-forms";
import { EnrolmentPanel } from "./enrolment-panel";
import { ExamTable } from "./exam-table";
import { QueryState } from "./query-state";

function CourseExams({ course }: { course: Course }) {
  const { t } = useI18n();
  const now = useNow();
  const exams = useApi<{ items: ExamListItem[] }>(paths.exams({ courseId: course.id }));
  const courses = useMemo(() => new Map([[course.id, course]]), [course]);
  return (
    <QueryState state={exams} skeleton="h-40 w-full" className="p-5">
      {({ items }) =>
        items.length === 0 ? <EmptyState title={t("admin.courses.examsEmpty")} /> : <ExamTable exams={items} courses={courses} now={now} hideCourse />
      }
    </QueryState>
  );
}

function CourseView({ course }: { course: Course }) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.courses"), href: "/admin/courses" }, { label: course.code }]} />}
        title={`${course.code} · ${course.name}`}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone="sky">{course.semester}</Badge><Badge tone="neutral">{course.faculty.code}</Badge></span>}
        actions={<Button variant="secondary" leftIcon={<PencilLine className="h-4 w-4" />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>}
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
        <Card className="self-start">
          <CardHeader title={t("admin.details")} />
          <CardContent className="pt-2">
            <DetailList
              items={[
                { label: t("admin.courses.code"), value: course.code },
                { label: t("admin.courses.semester"), value: course.semester },
                { label: t("admin.courses.faculty"), value: <Link className="hover:text-accent-strong" href={`/admin/faculties/${course.faculty.id}`}>{course.faculty.name}</Link> },
                { label: t("admin.courses.lecturer"), value: <Link className="hover:text-accent-strong" href={`/admin/users/${course.lecturer.id}`}>{course.lecturer.fullName}</Link> },
                { label: t("admin.courses.students"), value: course.activeStudents },
                { label: t("admin.created"), value: formatDate(course.createdAt, locale) },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <Tabs defaultValue="students">
            <div className="px-5 pt-5">
              <TabsList>
                <TabsTrigger value="students">{t("admin.courses.tabStudents")}</TabsTrigger>
                <TabsTrigger value="exams">{t("admin.courses.tabExams")}</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="students" className="mt-4 outline-none">
              <EnrolmentPanel course={course} />
            </TabsContent>
            <TabsContent value="exams" className="mt-4 outline-none">
              <CourseExams course={course} />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
      {editing && <CourseModal course={course} open onOpenChange={setEditing} />}
    </>
  );
}

export function CourseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const course = useApi<{ course: Course }>(paths.course(id));
  return <QueryState state={course} skeleton="h-72 w-full">{({ course: c }) => <CourseView course={c} />}</QueryState>;
}
