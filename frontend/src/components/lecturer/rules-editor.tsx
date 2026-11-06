"use client";

/**
 * Exam question rules: "N questions of type T, difficulty D, M marks each",
 * optionally limited to topics. Each student gets their own random draw from
 * the bank by these rules (the backend's exam generator); questions are never
 * hand-picked. The bank counts come from GET /api/courses/:id/question-summary;
 * the server re-checks that every rule has enough questions when saving.
 */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { DIFFICULTIES, QUESTION_TYPES, type BankSummaryRow, type Difficulty, type QuestionType, type RuleInput, type Topic } from "@/types/lecturer";

export interface RuleDraft {
  questionType: QuestionType;
  difficulty: Difficulty;
  marksPerQuestion: string;
  questionCount: string;
  topicIds: string[];
}

export const emptyRule = (): RuleDraft => ({ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: "", questionCount: "", topicIds: [] });

export function toRuleInputs(rules: RuleDraft[]): RuleInput[] {
  return rules.map((r) => ({
    questionType: r.questionType,
    difficulty: r.difficulty,
    marksPerQuestion: Number(r.marksPerQuestion),
    questionCount: Number(r.questionCount),
    ...(r.topicIds.length ? { topicIds: r.topicIds } : {}),
  }));
}

/** Questions in the bank matching a rule's type, difficulty and marks (all topics). */
export function availableFor(rule: Pick<RuleDraft, "questionType" | "difficulty" | "marksPerQuestion">, summary: BankSummaryRow[]) {
  const marks = Number(rule.marksPerQuestion);
  return summary.filter((s) => s.type === rule.questionType && s.difficulty === rule.difficulty && Math.abs(s.marks - marks) < 1e-6).reduce((n, s) => n + s.count, 0);
}

export function ruleTotals(rules: Pick<RuleDraft, "marksPerQuestion" | "questionCount">[]) {
  const questions = rules.reduce((s, r) => s + (Number(r.questionCount) || 0), 0);
  const marks = Math.round(rules.reduce((s, r) => s + (Number(r.questionCount) || 0) * (Number(r.marksPerQuestion) || 0), 0) * 100) / 100;
  return { questions, marks };
}

/** True when every rule has a whole count of at least 1 and marks above 0. */
export function rulesComplete(rules: RuleDraft[]) {
  return rules.every((r) => Number.isInteger(Number(r.questionCount)) && Number(r.questionCount) >= 1 && Number(r.marksPerQuestion) > 0);
}

export function RulesEditor({ rules, onChange, summary, topics }: { rules: RuleDraft[]; onChange: (rules: RuleDraft[]) => void; summary: BankSummaryRow[]; topics: Topic[] }) {
  const { t, locale } = useI18n();
  const update = (i: number, patch: Partial<RuleDraft>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const totals = ruleTotals(rules);
  // Mark values that exist in the bank for quick picking.
  const markOptions = [...new Set(summary.map((s) => s.marks))].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {rules.length === 0 && <p className="text-sm text-muted">{t("lecturer.exams.rulesEmpty")}</p>}
      {rules.map((r, i) => {
        const available = availableFor(r, summary);
        const count = Number(r.questionCount) || 0;
        const short = r.topicIds.length === 0 && Number(r.marksPerQuestion) > 0 && count > available;
        return (
          <div key={i} className="rounded-xl border border-border bg-surface-muted p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{t("lecturer.exams.rule", { number: i + 1 })}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(rules.filter((_, j) => j !== i))} aria-label={t("lecturer.exams.removeRule", { number: i + 1 })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label={t("lecturer.common.type")}>
                {({ id }) => (
                  <Select id={id} value={r.questionType} onChange={(e) => update(i, { questionType: e.target.value as QuestionType })}>
                    {QUESTION_TYPES.map((qt) => <option key={qt} value={qt}>{t(`admin.exams.questionTypes.${qt}`)}</option>)}
                  </Select>
                )}
              </Field>
              <Field label={t("lecturer.common.difficulty")}>
                {({ id }) => (
                  <Select id={id} value={r.difficulty} onChange={(e) => update(i, { difficulty: e.target.value as Difficulty })}>
                    {DIFFICULTIES.map((d) => <option key={d} value={d}>{t(`admin.exams.difficulty.${d}`)}</option>)}
                  </Select>
                )}
              </Field>
              <Field label={t("lecturer.exams.marksEach")}>
                {({ id }) => (
                  <>
                    <Input id={id} type="number" min={0.01} step={0.01} inputMode="decimal" list={`marks-${i}`} value={r.marksPerQuestion} onChange={(e) => update(i, { marksPerQuestion: e.target.value })} />
                    <datalist id={`marks-${i}`}>{markOptions.map((m) => <option key={m} value={m} />)}</datalist>
                  </>
                )}
              </Field>
              <Field label={t("lecturer.exams.count")}>
                {({ id }) => <Input id={id} type="number" min={1} max={200} step={1} inputMode="numeric" value={r.questionCount} onChange={(e) => update(i, { questionCount: e.target.value })} aria-invalid={short || undefined} />}
              </Field>
            </div>
            {topics.length > 0 && (
              <fieldset className="mt-3">
                <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{t("lecturer.exams.topics")}</legend>
                <div className="flex flex-wrap gap-2">
                  {topics.map((tp) => {
                    const on = r.topicIds.includes(tp.id);
                    return (
                      <label key={tp.id} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", on ? "border-accent bg-accent-soft text-foreground" : "border-border text-muted")}>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => update(i, { topicIds: on ? r.topicIds.filter((x) => x !== tp.id) : [...r.topicIds, tp.id] })} />
                        {tp.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <p className={cn("mt-2 text-xs", short ? "font-semibold text-danger" : "text-muted")}>
              {/* With topics chosen the server counts the pool; the summary covers all topics. */}
              {Number(r.marksPerQuestion) > 0 && r.topicIds.length === 0 ? t("lecturer.exams.available", { count: available }) : " "}
            </p>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...rules, emptyRule()])} disabled={rules.length >= 30}>{t("lecturer.exams.addRule")}</Button>
        <span className="text-sm font-semibold text-foreground">{t("lecturer.exams.totals", { questions: totals.questions, marks: formatNumber(totals.marks, locale, 2) })}</span>
      </div>
    </div>
  );
}
