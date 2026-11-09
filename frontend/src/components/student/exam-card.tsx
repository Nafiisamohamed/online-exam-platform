"use client";

/** One examination in the student's lists (from GET /api/my/exams), with its state, window and a countdown. */
import { CalendarClock, Clock, CreditCard } from "lucide-react";
import { ExamTypeBadge } from "@/components/exam-type-badge";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatTimeRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { untilParts } from "@/lib/student/exam-clock";
import type { MyExam, MyExamState } from "@/types/student";

export const stateTone: Record<MyExamState, BadgeTone> = { UNSCHEDULED: "neutral", UPCOMING: "sky", OPEN: "success", CLOSED: "neutral", IN_PROGRESS: "warning", SUBMITTED: "navy", TERMINATED: "danger" };

/** "2 d 4 h", "3 h 12 min", "4 min 09 s". */
export function useCountdownText() {
  return (targetIso: string, serverNow: number) => {
    const p = untilParts(targetIso, serverNow);
    const pad = (n: number) => String(n).padStart(2, "0");
    const text = p.days > 0 ? `${p.days} d ${p.hours} h` : p.hours > 0 ? `${p.hours} h ${pad(p.minutes)} min` : `${p.minutes} min ${pad(p.seconds)} s`;
    return { text, total: p.total };
  };
}

export function ExamCard({ exam, serverNow }: { exam: MyExam; serverNow: number | null }) {
  const { t, locale } = useI18n();
  const countdown = useCountdownText();
  const s = exam.schedule;
  const timeTo =
    s && serverNow !== null
      ? exam.state === "UPCOMING"
        ? t("student.common.opensIn", { time: countdown(s.windowStart, serverNow).text })
        : exam.state === "OPEN" || exam.state === "IN_PROGRESS"
          ? t("student.common.closesIn", { time: countdown(s.windowEnd, serverNow).text })
          : null
      : null;
  return (
    <Card interactive className="p-0">
      <Link href={`/student/exams/${exam.id}`} className="block space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">{exam.title}<ExamTypeBadge type={exam.examType} /></p>
            <p className="text-xs text-muted">{exam.course.code} · {exam.course.name}</p>
          </div>
          <Badge tone={stateTone[exam.state]} dot>{t(`student.common.examState.${exam.state}`)}</Badge>
        </div>
        {s && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-subtle" aria-hidden />{formatDate(s.windowStart, locale)} · {formatTimeRange(s.windowStart, s.windowEnd, locale)}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-subtle" aria-hidden />{t("student.common.minutes", { count: s.durationMinutes })}</span>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted">{t("student.common.questions", { count: exam.totalQuestions })} · {t("student.common.marks", { marks: exam.totalMarks })}</span>
          {timeTo && <span className="font-semibold text-accent-strong">{timeTo}</span>}
        </div>
        {exam.fee.required && (
          <p className={exam.fee.paid ? "text-xs text-success" : "flex items-center gap-1 text-xs font-semibold text-warning"}>
            {!exam.fee.paid && <CreditCard className="h-3.5 w-3.5" aria-hidden />}
            {exam.fee.paid ? t("student.common.feePaid", { receipt: exam.fee.receiptNumber ?? "—" }) : t("student.common.feeDue", { amount: exam.fee.amount, currency: exam.fee.currency })}
          </p>
        )}
      </Link>
    </Card>
  );
}
