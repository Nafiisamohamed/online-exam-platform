"use client";

/**
 * Exams that can have answers to grade: published, with at least one attempt
 * (own exams, plus exams where the lecturer is the blind second grader). The
 * count per exam is the server's own "remaining" figure from its grading queue.
 */
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/states";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { ExamListItem } from "@/types/admin";
import type { GradingQueue } from "@/types/lecturer";

export const gradable = (exams: ExamListItem[]) => exams.filter((e) => e.status === "PUBLISHED" && e.attempts > 0);

export function RemainingBadge({ examId }: { examId: string }) {
  const { t } = useI18n();
  const queue = useApi<GradingQueue>(lecturerPaths.grading(examId));
  if (queue.error) return <span className="text-xs text-subtle">—</span>;
  if (!queue.data) return <Skeleton className="h-5 w-20" />;
  return queue.data.remaining ? <Badge tone="warning">{t("lecturer.grading.remaining", { count: queue.data.remaining })}</Badge> : <Badge tone="success">{t("lecturer.grading.allDone")}</Badge>;
}

export function GradingList({ exams, limit }: { exams: ExamListItem[]; limit?: number }) {
  const { t } = useI18n();
  const rows = gradable(exams).slice(0, limit);
  if (rows.length === 0) return <EmptyState icon={ClipboardCheck} title={t("lecturer.grading.examsEmpty")} className="py-8" />;
  return (
    <ul className="divide-y divide-border">
      {rows.map((e) => (
        <li key={e.id}>
          <Link href={`/lecturer/grading/${e.id}`} className="flex items-center justify-between gap-3 px-1 py-3 hover:text-accent-strong">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground">{e.title}</span>
              <span className="block text-xs text-muted">{e.course.code} · {t("admin.exams.attempts")}: {e.attempts}{e.isSecondGrader ? ` · ${t("lecturer.common.secondGrader")}` : ""}</span>
            </span>
            <RemainingBadge examId={e.id} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
