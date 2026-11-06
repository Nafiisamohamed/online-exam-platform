"use client";

/**
 * Add a question (POST /api/courses/:courseId/questions) or edit one
 * (PUT /api/questions/:id). The form follows the backend's content rules per
 * type (lib/lecturer/question-rules.ts); the server checks them again and
 * its QUESTION_INVALID / DUPLICATE_QUESTION answers are shown as they come.
 * Editing a version an exam has already used creates a new version, so the
 * dialog says so before saving.
 */
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { createQuestion, lecturerPaths, updateQuestion, uploadQuestionImage } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/cn";
import { questionErrorText } from "@/lib/i18n/error-text";
import { useI18n } from "@/lib/i18n/i18n";
import { emptyForm, formFromVersion, questionProblems, rubricTotal, toInput, type ContentError, type QuestionForm } from "@/lib/lecturer/question-rules";
import { DIFFICULTIES, QUESTION_TYPES, type QuestionDetail, type QuestionType, type Topic } from "@/types/lecturer";

function ListRow({ children, onRemove, removeLabel, canRemove }: { children: ReactNode; onRemove: () => void; removeLabel: string; canRemove: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onRemove} disabled={!canRemove} aria-label={removeLabel}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function QuestionEditor({ courseId, question, open, onOpenChange, onSaved }: {
  courseId: string;
  /** Present when editing. */
  question?: QuestionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (q: QuestionDetail) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const topicsId = useId();
  const topics = useApi<{ items: Topic[] }>(lecturerPaths.topics(courseId));
  const current = question?.current ?? null;
  const [form, setForm] = useState<QuestionForm>(() => (current ? formFromVersion(current) : emptyForm()));
  const [problems, setProblems] = useState<ContentError[]>([]);
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const changeType = (type: QuestionType) => setForm((f) => ({ ...emptyForm(type), text: f.text, marks: f.marks, difficulty: f.difficulty, topic: f.topic, imagePath: f.imagePath, imageUrl: f.imageUrl }));

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setServerError(null);
    try {
      const res = await uploadQuestionImage(file);
      setForm((f) => ({ ...f, imagePath: res.imagePath, imageUrl: res.imageUrl }));
    } catch (err) {
      setServerError(err);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = toInput(form);
    const found = questionProblems(input);
    setProblems(found);
    if (found.length) return;
    setBusy(true);
    setServerError(null);
    try {
      if (question) {
        const res = await updateQuestion(question.id, courseId, input);
        toast(res.newVersionCreated ? t("lecturer.questions.newVersionToast") : t("lecturer.questions.savedToast"));
        onSaved?.(res.question);
      } else {
        const q = await createQuestion(courseId, input);
        toast(t("lecturer.questions.createdToast"));
        onSaved?.(q);
      }
      onOpenChange(false);
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  };

  const total = rubricTotal(form.rubric);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={question ? t("lecturer.questions.editTitle") : t("lecturer.questions.createTitle")}
      closeLabel={t("common.cancel")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="question-form" loading={busy} disabled={uploading}>{t("common.save")}</Button>
        </>
      }
    >
      <form id="question-form" onSubmit={submit} className="space-y-4" noValidate>
        {current?.isLocked && (
          <Alert tone="info">{t("lecturer.questions.editLockedNote", { next: (question?.versions.length ?? 0) + 1, current: current.versionNumber })}</Alert>
        )}
        <FormError error={serverError} />
        {problems.length > 0 && (
          <Alert tone="danger" title={t("errors.QUESTION_INVALID")}>
            <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{questionErrorText(t, p)}</li>)}</ul>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("lecturer.common.type")} required>
            {({ id }) => (
              <Select id={id} value={form.type} onChange={(e) => changeType(e.target.value as QuestionType)}>
                {QUESTION_TYPES.map((qt) => <option key={qt} value={qt}>{t(`admin.exams.questionTypes.${qt}`)}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("lecturer.common.difficulty")} required>
            {({ id }) => (
              <Select id={id} value={form.difficulty} onChange={(e) => set("difficulty", e.target.value as QuestionForm["difficulty"])}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{t(`admin.exams.difficulty.${d}`)}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("lecturer.common.marks")} required>
            {({ id }) => <Input id={id} type="number" min={0.01} max={1000} step={0.01} inputMode="decimal" value={form.marks} onChange={(e) => set("marks", e.target.value)} />}
          </Field>
        </div>

        <Field label={t("lecturer.questions.text")} required>
          {({ id }) => <Textarea id={id} value={form.text} onChange={(e) => set("text", e.target.value)} maxLength={5000} rows={4} />}
        </Field>

        <Field label={t("lecturer.common.topic")} hint={t("lecturer.questions.topicHint")} required>
          {({ id, describedBy }) => (
            <>
              <Input id={id} aria-describedby={describedBy} value={form.topic} onChange={(e) => set("topic", e.target.value)} maxLength={100} list={topicsId} autoComplete="off" />
              <datalist id={topicsId}>{topics.data?.items.map((tp) => <option key={tp.id} value={tp.name} />)}</datalist>
            </>
          )}
        </Field>

        <Field label={t("lecturer.questions.image")} hint={t("lecturer.questions.imageHint")}>
          {({ id, describedBy }) => (
            <div className="flex flex-wrap items-center gap-3">
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- served by the API with the session cookie
                <img src={form.imageUrl} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
              )}
              <label htmlFor={id} className={cn("inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-strong px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted focus-within:ring-4 focus-within:ring-ring", uploading && "opacity-60")}>
                <ImagePlus className="h-4 w-4" aria-hidden /> {uploading ? t("lecturer.questions.uploading") : t("lecturer.questions.chooseImage")}
                <input id={id} aria-describedby={describedBy} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => void pickImage(e.target.files?.[0])} disabled={uploading} />
              </label>
              {form.imagePath && (
                <Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={() => setForm((f) => ({ ...f, imagePath: null, imageUrl: null }))}>{t("lecturer.questions.removeImage")}</Button>
              )}
            </div>
          )}
        </Field>

        {form.type === "MCQ" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">{t("lecturer.questions.options")}</legend>
            <p className="text-xs text-muted">{t("lecturer.questions.optionsHint")}</p>
            {form.options.map((o, i) => (
              <ListRow key={i} onRemove={() => set("options", form.options.filter((_, j) => j !== i))} removeLabel={t("lecturer.questions.removeOption", { number: i + 1 })} canRemove={form.options.length > 4}>
                <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted">
                  <input type="radio" name="correct-option" checked={o.isCorrect} onChange={() => set("options", form.options.map((x, j) => ({ ...x, isCorrect: j === i })))} className="h-4 w-4 accent-[var(--accent-strong)]" />
                  {t("lecturer.questions.correct")}
                </label>
                <Input aria-label={t("lecturer.questions.option", { number: i + 1 })} value={o.text} onChange={(e) => set("options", form.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} maxLength={1000} />
              </ListRow>
            ))}
            {form.options.length < 5 && (
              <Button variant="ghost" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => set("options", [...form.options, { text: "", isCorrect: false }])}>{t("lecturer.questions.addOption")}</Button>
            )}
          </fieldset>
        )}

        {form.type === "TRUE_FALSE" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">{t("lecturer.questions.trueFalseAnswer")}</legend>
            <div className="flex gap-3">
              {[true, false].map((v) => (
                <label key={String(v)} className={cn("flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm", form.trueIsCorrect === v ? "border-accent bg-accent-soft font-semibold text-foreground" : "border-border text-text")}>
                  <input type="radio" name="tf-answer" checked={form.trueIsCorrect === v} onChange={() => set("trueIsCorrect", v)} className="h-4 w-4 accent-[var(--accent-strong)]" />
                  {v ? t("lecturer.questions.true") : t("lecturer.questions.false")}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {form.type === "SHORT_ANSWER" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">{t("lecturer.questions.acceptedAnswers")}</legend>
            <p className="text-xs text-muted">{t("lecturer.questions.acceptedHint")}</p>
            {form.acceptedAnswers.map((a, i) => (
              <ListRow key={i} onRemove={() => set("acceptedAnswers", form.acceptedAnswers.filter((_, j) => j !== i))} removeLabel={t("lecturer.questions.remove")} canRemove={form.acceptedAnswers.length > 1}>
                <Input aria-label={t("lecturer.questions.acceptedAnswer", { number: i + 1 })} value={a} onChange={(e) => set("acceptedAnswers", form.acceptedAnswers.map((x, j) => (j === i ? e.target.value : x)))} maxLength={500} />
              </ListRow>
            ))}
            {form.acceptedAnswers.length < 20 && (
              <Button variant="ghost" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => set("acceptedAnswers", [...form.acceptedAnswers, ""])}>{t("lecturer.questions.addAccepted")}</Button>
            )}
          </fieldset>
        )}

        {form.type === "ESSAY" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">{t("lecturer.questions.rubric")}</legend>
            <p className="text-xs text-muted">{t("lecturer.questions.rubricHint")}</p>
            {form.rubric.map((r, i) => (
              <ListRow key={i} onRemove={() => set("rubric", form.rubric.filter((_, j) => j !== i))} removeLabel={t("lecturer.questions.remove")} canRemove={form.rubric.length > 1}>
                <Input aria-label={`${t("lecturer.questions.criterion")} ${i + 1}`} value={r.description} onChange={(e) => set("rubric", form.rubric.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} maxLength={1000} />
                <Input aria-label={`${t("lecturer.questions.criterionMarks")} ${i + 1}`} type="number" min={0.01} step={0.01} inputMode="decimal" className="w-24 shrink-0" value={r.maxMarks} onChange={(e) => set("rubric", form.rubric.map((x, j) => (j === i ? { ...x, maxMarks: e.target.value } : x)))} />
              </ListRow>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {form.rubric.length < 20 && (
                <Button variant="ghost" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => set("rubric", [...form.rubric, { description: "", maxMarks: "" }])}>{t("lecturer.questions.addCriterion")}</Button>
              )}
              <span className={cn("text-xs font-semibold", Number(form.marks) && total === Number(form.marks) ? "text-success" : "text-muted")}>
                {t("lecturer.questions.rubricTotal", { total, marks: form.marks || 0 })}
              </span>
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
