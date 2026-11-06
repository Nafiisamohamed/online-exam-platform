"use client";

/**
 * One of the lecturer's courses: details, the enrolled students
 * (GET /api/courses/:id/enrolments, read-only: the registrar enrols and drops)
 * and its examinations with participation (attempts compared with active
 * enrolments). Per-student grades are on each exam's results page.
 */
import { use, useMemo } from "react";
import Link from "next/link";
import { DetailList, EnrolmentBadge } from "@/components/admin/admin-ui";
import { ExamTable } from "@/components/admin/exam-table";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { useNow } from "@/hooks/use-now";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course, Enrolment, ExamListItem } from "@/types/admin";

function CourseBody({ course }: { course: Course }) {
  const { t, locale } = useI18n();
  const now = useNow();
  const enrolments = useApi<{ items: Enrolment[] }>(lecturerPaths.enrolments(course.id));
  const exams = useApi<{ items: ExamListItem[] }>(lecturerPaths.exams({ courseId: course.id }));
  const courses = useMemo(() => new Map([[course.id, course]]), [course]);

  const columns: Column<Enrolment>[] = [
    {
      key: "student",
      header: t("admin.enrolment.student"),
      primary: true,
      cell: (e) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-foreground">{e.student.fullName}</span>
          <span className="block text-xs text-muted">{e.student.studentNumber}</span>
        </span>
      ),
    },
    { key: "phone", header: t("admin.enrolment.phone"), cell: (e) => <span className="whitespace-nowrap tabular-nums">{e.student.phone}</span>, className: "hidden lg:table-cell" },
    { key: "status", header: t("admin.status"), cell: (e) => <EnrolmentBadge status={e.status} /> },
    { key: "enrolled", header: t("admin.enrolment.enrolledAt"), cell: (e) => <span className="whitespace-nowrap text-muted">{formatDate(e.enrolledAt, locale)}</span> },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.courses"), href: "/lecturer/courses" }, { label: course.code }]} />}
        title={`${course.code} · ${course.name}`}
        description={<span className="flex flex-wrap gap-2"><Badge tone="sky">{course.semester}</Badge><Badge tone="neutral">{course.faculty.code}</Badge></span>}
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] [&>*]:min-w-0">
        <Card className="self-start">
          <CardHeader title={t("admin.details")} />
          <CardContent className="pt-2">
            <DetailList
              items={[
                { label: t("admin.courses.faculty"), value: course.faculty.name },
                { label: t("admin.courses.semester"), value: course.semester },
                { label: t("admin.courses.students"), value: course.activeStudents },
              ]}
            />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title={t("lecturer.courses.examsTitle")} className="pb-4" />
            <QueryState state={exams} skeleton="h-32 w-full" className="p-5">
              {({ items }) =>
                items.length === 0 ? <EmptyState title={t("admin.courses.examsEmpty")} /> : <ExamTable exams={items} courses={courses} now={now} hideCourse hideLecturer basePath="/lecturer/exams" />
              }
            </QueryState>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={t("lecturer.courses.studentsTitle")} description={t("lecturer.courses.studentsHint")} className="pb-4" />
            <QueryState state={enrolments} skeleton="h-32 w-full" className="p-5">
              {({ items }) => <DataTable columns={columns} rows={items} rowKey={(e) => e.id} emptyTitle={t("table.noRows")} caption={t("lecturer.courses.studentsTitle")} />}
            </QueryState>
          </Card>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted"><Link href="/lecturer/results" className="hover:text-accent-strong">{t("nav.results")} →</Link></p>
    </>
  );
}

export function LecturerCourseView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const course = useApi<{ course: Course }>(lecturerPaths.course(id));
  return <QueryState state={course} skeleton="h-72 w-full">{({ course: c }) => <CourseBody course={c} />}</QueryState>;
}
