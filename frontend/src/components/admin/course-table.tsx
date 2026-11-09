"use client";

/** Course rows (GET /api/courses), used by the course list and the faculty detail page. */
import Link from "next/link";
import type { ReactNode } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course } from "@/types/admin";

export function CourseTable({ rows, loading, hideFaculty, hideLecturer, empty, actions, basePath = "/admin/courses" }: { rows: Course[]; loading?: boolean; hideFaculty?: boolean; hideLecturer?: boolean; empty?: ReactNode; actions?: (c: Course) => ReactNode; basePath?: string }) {
  const { t } = useI18n();
  const columns: Column<Course>[] = [
    {
      key: "course",
      header: t("admin.courses.name"),
      primary: true,
      cell: (c) => (
        <Link href={`${basePath}/${c.id}`} className="group block min-w-0">
          <span className="block font-semibold text-foreground group-hover:text-accent-strong">{c.code}</span>
          <span className="block truncate text-sm text-muted">{c.name}</span>
        </Link>
      ),
    },
    ...(hideFaculty ? [] : [{ key: "faculty", header: t("admin.courses.faculty"), cell: (c: Course) => <span title={c.faculty.name}>{c.faculty.code}</span> }]),
    {
      key: "semester",
      header: t("admin.academic.yearAndSemester"),
      cell: (c) => c.academicYear && c.semesterNumber
        ? <span className="whitespace-nowrap">{c.academicYear.name} · {t("admin.academic.semesterN", { n: c.semesterNumber })}</span>
        : <span className="whitespace-nowrap text-muted">{c.semester}</span>,
    },
    ...(hideLecturer ? [] : [{ key: "lecturer", header: t("admin.courses.lecturer"), cell: (c: Course) => <Link href={`/admin/users/${c.lecturer.id}`} className="hover:text-accent-strong">{c.lecturer.fullName}</Link> }]),
    { key: "students", header: t("admin.courses.students"), align: "right", cell: (c) => <span className="tabular-nums">{c.activeStudents}</span> },
    ...(actions ? [{ key: "actions", header: <span className="sr-only">{t("table.actions")}</span>, align: "right" as const, cell: actions }] : []),
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} loading={loading} emptyTitle={empty ?? t("table.noRows")} caption={t("nav.courses")} />;
}
