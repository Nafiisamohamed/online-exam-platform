"use client";

/**
 * One faculty. The API has no single-faculty endpoint, so the faculty comes
 * from GET /api/faculties (already cached by the list) and its courses from
 * GET /api/courses?facultyId=…; the totals are added up from those courses.
 */
import { BookOpenCheck, GraduationCap, PencilLine, UserRound } from "lucide-react";
import { use, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course, Faculty, FacultyLecturer } from "@/types/admin";
import { CourseTable } from "./course-table";
import { FacultyModal } from "./faculty-forms";
import { FacultyLecturers } from "./faculty-lecturers";
import { QueryState } from "./query-state";

export function FacultyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const courses = useApi<{ items: Course[] }>(paths.courses({ facultyId: id }));
  const assigned = useApi<{ items: FacultyLecturer[] }>(paths.facultyLecturers(id));
  const [editing, setEditing] = useState(false);

  return (
    <QueryState state={faculties} skeleton="h-72 w-full">
      {({ items }) => {
        const faculty = items.find((f) => f.id === id);
        if (!faculty) return <Card><EmptyState title={t("errors.FACULTY_NOT_FOUND")} /></Card>;
        const list = courses.data?.items ?? [];
        const enrolments = list.reduce((s, c) => s + c.activeStudents, 0);
        return (
          <>
            <PageHeader
              eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.faculties"), href: "/admin/faculties" }, { label: faculty.code }]} />}
              title={faculty.name}
              description={<span className="font-mono text-sm font-semibold">{faculty.code}</span>}
              actions={<Button variant="secondary" leftIcon={<PencilLine className="h-4 w-4" />} onClick={() => setEditing(true)}>{t("admin.faculties.rename")}</Button>}
            />
            <section className="mb-6 grid gap-4 sm:grid-cols-3">
              <StatCard emphasis label={t("admin.faculties.courses")} value={faculty._count.courses} icon={BookOpenCheck} />
              <StatCard label={t("admin.faculties.activeStudents")} value={courses.data ? enrolments : "—"} icon={GraduationCap} />
              <StatCard label={t("admin.faculties.lecturers")} value={assigned.data ? assigned.data.items.length : "—"} icon={UserRound} />
            </section>
            <FacultyLecturers facultyId={id} />
            <Card className="overflow-hidden">
              <CardHeader title={t("admin.faculties.coursesIn")} className="pb-4" />
              <QueryState state={courses} skeleton="h-40 w-full" className="p-5">
                {() => <CourseTable rows={list} hideFaculty empty={t("admin.faculties.noCourses")} />}
              </QueryState>
            </Card>
            {editing && <FacultyModal faculty={faculty} open onOpenChange={setEditing} />}
          </>
        );
      }}
    </QueryState>
  );
}
