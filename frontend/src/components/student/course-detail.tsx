"use client";

/**
 * One of the student's courses (GET /api/courses/:id: only for an actively
 * enrolled student) with its lecturer and the student's exams in it (from GET /api/my/exams).
 */
import { use } from "react";
import { DetailList } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { useServerNow } from "@/hooks/use-server-now";
import { studentPaths } from "@/lib/api/student";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course } from "@/types/admin";
import type { MyExam } from "@/types/student";
import { ExamCard } from "./exam-card";

function Body({ course }: { course: Course }) {
  const { t } = useI18n();
  const exams = useApi<{ items: MyExam[] }>(studentPaths.myExams);
  const serverNow = useServerNow();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.courses"), href: "/student/courses" }, { label: course.code }]} />}
        title={`${course.code} · ${course.name}`}
        description={<Badge tone="sky">{course.semester}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <Card className="self-start">
          <CardHeader title={t("admin.details")} />
          <CardContent className="pt-2">
            <DetailList
              items={[
                { label: t("student.courses.lecturer"), value: course.lecturer.fullName },
                { label: t("student.courses.faculty"), value: course.faculty.name },
                { label: t("student.courses.semester"), value: course.semester },
              ]}
            />
          </CardContent>
        </Card>
        <div>
          <h2 className="mb-3 text-base font-semibold text-foreground">{t("student.courses.exams")}</h2>
          <QueryState state={exams} skeleton="h-32 w-full">
            {({ items }) => {
              const mine = items.filter((e) => e.course.id === course.id);
              return mine.length === 0 ? <Card><EmptyState title={t("student.courses.examsEmpty")} /></Card> : (
                <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">{mine.map((e) => <ExamCard key={e.id} exam={e} serverNow={serverNow} />)}</div>
              );
            }}
          </QueryState>
        </div>
      </div>
    </>
  );
}

export function StudentCourseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const course = useApi<{ course: Course }>(studentPaths.course(id));
  return <QueryState state={course} skeleton="h-64 w-full">{({ course: c }) => <Body course={c} />}</QueryState>;
}
