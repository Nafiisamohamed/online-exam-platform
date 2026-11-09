"use client";

/**
 * Examination rows for oversight (GET /api/exams). The exam list has no
 * lecturer or enrolment numbers, so those come from the course list
 * (GET /api/courses, passed in as `courses`), matched by course id.
 */
import Link from "next/link";
import { ExamTypeBadge } from "@/components/exam-type-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { currentSchedule, examState } from "@/lib/admin/exam-state";
import { formatDate, formatTimeRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course, ExamListItem } from "@/types/admin";
import { ExamStateBadge, ResultsBadge } from "./admin-ui";

export function ExamTable({ exams, courses, now, loading, hideCourse, hideLecturer, basePath = "/admin/exams" }: { exams: ExamListItem[]; courses: Map<string, Course>; now: number; loading?: boolean; hideCourse?: boolean; hideLecturer?: boolean; basePath?: string }) {
  const { t, locale } = useI18n();
  const columns: Column<ExamListItem>[] = [
    {
      key: "exam",
      header: t("admin.exams.examination"),
      primary: true,
      cell: (e) => (
        <Link href={`${basePath}/${e.id}`} className="group block min-w-0">
          <span className="flex flex-wrap items-center gap-2 font-semibold text-foreground group-hover:text-accent-strong">{e.title}<ExamTypeBadge type={e.examType} /></span>
          {!hideCourse && <span className="block truncate text-xs text-muted">{e.course.code} · {e.course.name}</span>}
        </Link>
      ),
    },
    ...(hideLecturer ? [] : [{
      key: "lecturer",
      header: t("admin.exams.lecturer"),
      cell: (e: ExamListItem) => courses.get(e.course.id)?.lecturer.fullName ?? "—",
      className: "hidden lg:table-cell",
    }]),
    {
      key: "scheduled",
      header: t("admin.exams.scheduled"),
      cell: (e) => {
        const s = currentSchedule(e.schedules);
        return s ? (
          <span className="whitespace-nowrap">
            {formatDate(s.windowStart, locale)}
            <span className="block text-xs text-muted">{formatTimeRange(s.windowStart, s.windowEnd, locale)}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: "duration",
      header: t("admin.exams.duration"),
      cell: (e) => {
        const s = currentSchedule(e.schedules);
        return s ? <span className="whitespace-nowrap">{t("admin.minutes", { count: s.durationMinutes })}</span> : "—";
      },
    },
    { key: "enrolled", header: t("admin.exams.enrolled"), align: "right", cell: (e) => <span className="tabular-nums">{courses.get(e.course.id)?.activeStudents ?? "—"}</span> },
    { key: "attempts", header: t("admin.exams.attempts"), align: "right", cell: (e) => <span className="tabular-nums">{e.attempts}</span>, className: "hidden xl:table-cell" },
    {
      key: "stage",
      header: t("admin.exams.stage"),
      cell: (e) => (
        <span className="flex flex-col items-end gap-1 md:items-start">
          <ExamStateBadge state={examState(e, now)} />
          {e.status === "PUBLISHED" && e.resultsStatus !== "UNPUBLISHED" && <ResultsBadge status={e.resultsStatus} />}
        </span>
      ),
    },
  ];
  return <DataTable columns={columns} rows={exams} rowKey={(e) => e.id} loading={loading} emptyTitle={t("table.noRows")} caption={t("admin.exams.title")} />;
}
