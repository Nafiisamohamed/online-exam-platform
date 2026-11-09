"use client";

/**
 * Question selection for one exam (GET /api/exams/:id/question-pool, PUT .../excluded-questions).
 * For each rule the lecturer sees the reviewed questions that match its topic, difficulty and
 * type, and can untick any they do not want while the exam is a draft. Each student still gets
 * a random set drawn from the ticked questions, with the same number per rule (same difficulty
 * and marks for everyone). The server refuses a selection that leaves a rule short.
 */
import { CheckSquare, Save } from "lucide-react";
import { useState } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { questionPoolPath, setExcludedQuestions } from "@/lib/api/lecturer";
import { invalidate, useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/i18n";
import type { QuestionPool } from "@/types/lecturer";

export function QuestionSelection({ examId }: { examId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const pool = useApi<QuestionPool>(questionPoolPath(examId));
  // Questions unticked on screen but not saved yet (null = as saved).
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const saved = new Set((pool.data?.rules ?? []).flatMap((r) => r.questions.filter((q) => !q.included).map((q) => q.questionId)));
  const excluded = draft ?? saved;
  const editable = pool.data?.status === "DRAFT";
  const changed = draft !== null && (draft.size !== saved.size || [...draft].some((id) => !saved.has(id)));

  const toggle = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDraft(next);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setExcludedQuestions(examId, [...excluded]);
      invalidate(questionPoolPath(examId));
      setDraft(null);
      toast(t("lecturer.selection.saved"));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t("lecturer.selection.title")}
        description={editable ? t("lecturer.selection.hint") : t("lecturer.selection.lockedHint")}
        action={editable ? <Button size="sm" leftIcon={<Save className="h-4 w-4" />} disabled={!changed} loading={busy} onClick={save}>{t("lecturer.selection.save")}</Button> : undefined}
      />
      <CardContent className="space-y-5">
        <FormError error={error} />
        <QueryState state={pool} skeleton="h-40 w-full">
          {({ rules }) => rules.length === 0 ? (
            <p className="text-sm text-muted">{t("lecturer.selection.noRules")}</p>
          ) : rules.map((r) => {
            const ticked = r.questions.filter((q) => !excluded.has(q.questionId)).length;
            const short = ticked < r.questionCount;
            return (
              <section key={r.id} aria-label={t("lecturer.selection.ruleLabel", { n: r.position })}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{t("lecturer.selection.ruleLabel", { n: r.position })}</span>
                  <Badge tone="neutral">{t(`admin.exams.questionTypes.${r.questionType}`)}</Badge>
                  <Badge tone="neutral">{t(`admin.exams.difficulty.${r.difficulty}`)}</Badge>
                  <Badge tone={short ? "danger" : "success"}>{t("lecturer.selection.tickedCount", { ticked, needed: r.questionCount })}</Badge>
                </div>
                {r.questions.length === 0 ? (
                  <p className="text-sm text-muted">{t("lecturer.selection.noReviewed")}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {r.questions.map((q) => {
                      const on = !excluded.has(q.questionId);
                      return (
                        <li key={q.questionId}>
                          <label className={cn("flex items-start gap-3 px-3 py-2.5 text-sm", editable ? "cursor-pointer" : "cursor-default", !on && "opacity-60")}>
                            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" checked={on} disabled={!editable} onChange={() => toggle(q.questionId)} aria-label={q.text} />
                            <span className="min-w-0">
                              <span className="line-clamp-2 text-foreground">{q.text}</span>
                              <span className="text-xs text-muted">{q.topic}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </QueryState>
        <p className="flex items-center gap-2 text-xs text-muted"><CheckSquare className="h-3.5 w-3.5" aria-hidden />{t("lecturer.selection.randomNote")}</p>
      </CardContent>
    </Card>
  );
}
