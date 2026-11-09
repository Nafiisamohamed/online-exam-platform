"use client";

/**
 * Exam settings shared by the create page and the "Edit settings" dialog:
 * instructions, shuffling, answer review and the optional blind second
 * grader. After publishing the backend fixes shuffling and the fee
 * (EXAM_PUBLISHED_LOCKED), so those fields are disabled then.
 */
import { Field, Select, Textarea } from "@/components/ui/form";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import type { StaffMember } from "@/types/admin";
import type { ExamSettingsInput, LecturerExam } from "@/types/lecturer";

export interface SettingsDraft {
  instructions: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowAnswerReview: boolean;
  feeAmount: string;
  feeCurrency: string;
  secondGraderId: string;
}

export const defaultSettings = (): SettingsDraft => ({ instructions: "", shuffleQuestions: true, shuffleOptions: true, allowAnswerReview: false, feeAmount: "0", feeCurrency: "", secondGraderId: "" });

export function settingsFromExam(e: LecturerExam): SettingsDraft {
  return {
    instructions: e.instructions,
    shuffleQuestions: e.shuffleQuestions,
    shuffleOptions: e.shuffleOptions,
    allowAnswerReview: e.allowAnswerReview,
    feeAmount: String(e.feeAmount ?? 0),
    feeCurrency: e.feeCurrency,
    secondGraderId: e.secondGrader?.id ?? "",
  };
}

/** The request fields; `locked` leaves out what cannot change after publishing. */
export function settingsInput(d: SettingsDraft, locked = false): ExamSettingsInput {
  return {
    instructions: d.instructions.trim(),
    allowAnswerReview: d.allowAnswerReview,
    secondGraderId: d.secondGraderId || null,
    ...(locked
      ? {}
      : {
          shuffleQuestions: d.shuffleQuestions,
          shuffleOptions: d.shuffleOptions,
        }),
  };
}

function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-text has-[:disabled]:opacity-60">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-strong)]" />
      {label}
    </label>
  );
}

export function ExamSettingsFields({ value, onChange, locked }: { value: SettingsDraft; onChange: (v: SettingsDraft) => void; locked?: boolean }) {
  const { t } = useI18n();
  const { profile } = useSession();
  const lecturers = useApi<{ items: StaffMember[] }>(lecturerPaths.staff("LECTURER"));
  const set = <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => onChange({ ...value, [k]: v });
  // The backend refuses the course lecturer as their own second grader.
  const others = (lecturers.data?.items ?? []).filter((l) => l.id !== profile.id);

  return (
    <div className="space-y-4">
      <Field label={t("lecturer.exams.instructions")} hint={t("lecturer.exams.instructionsHint")}>
        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={value.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={5000} rows={3} />}
      </Field>
      <div className="space-y-2.5">
        <Check checked={value.shuffleQuestions} onChange={(v) => set("shuffleQuestions", v)} label={t("lecturer.exams.shuffleQuestions")} disabled={locked} />
        <Check checked={value.shuffleOptions} onChange={(v) => set("shuffleOptions", v)} label={t("lecturer.exams.shuffleOptions")} disabled={locked} />
        <Check checked={value.allowAnswerReview} onChange={(v) => set("allowAnswerReview", v)} label={t("lecturer.exams.answerReview")} />
      </div>
      {/* Fees are per semester since Phase 4 (registrar: Fees page); exams no longer have their own fee. */}
      <Field label={t("lecturer.exams.secondGrader")} hint={t("lecturer.exams.secondGraderHint")}>
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} value={value.secondGraderId} onChange={(e) => set("secondGraderId", e.target.value)}>
            <option value="">{t("lecturer.exams.noSecondGrader")}</option>
            {others.map((l) => <option key={l.id} value={l.id}>{l.fullName}</option>)}
          </Select>
        )}
      </Field>
    </div>
  );
}
