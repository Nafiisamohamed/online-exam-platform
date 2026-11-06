"use client";

/**
 * One question with its answer key, as the lecturer sees it: options with the
 * correct one marked, accepted short answers, or the essay rubric. Used for
 * question details, old versions and the exam sample draw.
 */
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Difficulty, QuestionType } from "@/types/lecturer";

export interface ViewableQuestion {
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  marks: number;
  difficulty: Difficulty;
  topic: string;
  options: { id?: string; text: string; isCorrect: boolean }[];
  acceptedAnswers: string[];
  rubric: { description: string; maxMarks: number }[];
}

export function QuestionMeta({ q }: { q: Pick<ViewableQuestion, "type" | "difficulty" | "topic" | "marks"> }) {
  const { t, locale } = useI18n();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone="sky">{t(`admin.exams.questionTypes.${q.type}`)}</Badge>
      <Badge tone="neutral">{t(`admin.exams.difficulty.${q.difficulty}`)}</Badge>
      <Badge tone="neutral">{q.topic}</Badge>
      <Badge tone="navy">{t("lecturer.common.marksValue", { marks: formatNumber(q.marks, locale, 2) })}</Badge>
    </span>
  );
}

export function QuestionView({ q, number }: { q: ViewableQuestion; number?: number }) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-3">
      <QuestionMeta q={q} />
      <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground">
        {number !== undefined && <span className="mr-1 font-semibold">{number}.</span>}
        {q.text}
      </p>
      {q.imageUrl && (
        // Question images come from the API (authenticated); next/image cannot send the session cookie.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={q.imageUrl} alt="" className="max-h-72 rounded-xl border border-border object-contain" />
      )}
      {(q.type === "MCQ" || q.type === "TRUE_FALSE") && (
        <ul className="space-y-1.5">
          {q.options.map((o, i) => (
            <li key={o.id ?? i} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", o.isCorrect ? "border-success/40 bg-success-soft" : "border-border")}>
              {o.isCorrect ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />}
              <span className="flex-1 text-text">{q.type === "TRUE_FALSE" ? (o.text.toLowerCase() === "true" ? t("lecturer.questions.true") : t("lecturer.questions.false")) : o.text}</span>
              {o.isCorrect && <span className="text-xs font-semibold text-success">{t("lecturer.questions.correct")}</span>}
            </li>
          ))}
        </ul>
      )}
      {q.type === "SHORT_ANSWER" && (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{t("lecturer.questions.acceptedAnswers")}</p>
          <ul className="flex flex-wrap gap-1.5">
            {q.acceptedAnswers.map((a, i) => <li key={i}><Badge tone="success">{a}</Badge></li>)}
          </ul>
        </div>
      )}
      {q.type === "ESSAY" && (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{t("lecturer.questions.rubric")}</p>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {q.rubric.map((r, i) => (
              <li key={i} className="flex justify-between gap-3 px-3 py-2">
                <span className="text-text">{r.description}</span>
                <span className="shrink-0 font-semibold text-foreground">{formatNumber(r.maxMarks, locale, 2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
