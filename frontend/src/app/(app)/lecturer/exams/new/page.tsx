"use client";

/**
 * Create a draft examination (POST /api/exams) for one of the lecturer's
 * courses: title, settings and question rules, with a review summary before
 * creating. The server checks the rules against the bank and the settings
 * (fee currency, second grader) and its errors are shown as they come.
 */
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/layout/app-shell";
import { CourseSelect, useChosenCourse, WithMyCourses } from "@/components/lecturer/course-picker";
import { defaultSettings, ExamSettingsFields, settingsInput, type SettingsDraft } from "@/components/lecturer/exam-settings-fields";
import { RulesEditor, ruleTotals, rulesComplete, toRuleInputs, type RuleDraft } from "@/components/lecturer/rules-editor";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { EXAM_TYPES, type ExamType } from "@/types/admin";
import { useToast } from "@/components/ui/toast";
import { DetailList } from "@/components/admin/admin-ui";
import { createExam, lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course } from "@/types/admin";
import type { BankSummaryRow, Topic } from "@/types/lecturer";

function NewExamForm({ courses }: { courses: Course[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [courseId, setCourseId] = useChosenCourse(courses);
  const [title, setTitle] = useState("");
  const [examType, setExamType] = useState<ExamType | "">("");
  const [settings, setSettings] = useState<SettingsDraft>(defaultSettings);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const summary = useApi<{ items: BankSummaryRow[] }>(lecturerPaths.bankSummary(courseId));
  const topics = useApi<{ items: Topic[] }>(lecturerPaths.topics(courseId));
  const course = courses.find((c) => c.id === courseId);
  const totals = ruleTotals(rules);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const incomplete = !title.trim() || !examType || !courseId || !rulesComplete(rules);
    setMissing(incomplete);
    if (incomplete) return;
    setBusy(true);
    setError(null);
    try {
      const exam = await createExam(courseId, { title: title.trim(), examType: examType as ExamType, ...settingsInput(settings), ...(rules.length ? { rules: toRuleInputs(rules) } : {}) });
      toast(t("lecturer.exams.createdToast"));
      router.push(`/lecturer/exams/${exam.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <div className="space-y-6">
        <Card>
          <CardHeader title={t("lecturer.exams.basics")} />
          <CardContent className="space-y-4">
            <CourseSelect courses={courses} value={courseId} onChange={(id) => { setCourseId(id); setRules([]); }} />
            <Field label={t("lecturer.exams.examTitle")} error={missing && !title.trim() ? t("validation.required") : undefined} required>
              {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}
            </Field>
            <Field label={t("lecturer.exams.examType")} hint={t("lecturer.exams.examTypeHint")} error={missing && !examType ? t("validation.required") : undefined} required>
              {({ id, describedBy, invalid }) => (
                <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
                  <option value="">{t("lecturer.exams.chooseExamType")}</option>
                  {EXAM_TYPES.map((x) => <option key={x} value={x}>{t(`examTypes.${x}`)}</option>)}
                </Select>
              )}
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("lecturer.exams.settings")} />
          <CardContent><ExamSettingsFields value={settings} onChange={setSettings} /></CardContent>
        </Card>
        <Card>
          <CardHeader title={t("lecturer.exams.rules")} description={t("lecturer.exams.rulesHint")} />
          <CardContent>
            <RulesEditor key={courseId} rules={rules} onChange={(next) => { setRules(next); setError(null); }} summary={summary.data?.items ?? []} topics={topics.data?.items ?? []} />
          </CardContent>
        </Card>
      </div>

      <Card className="self-start xl:sticky xl:top-24">
        <CardHeader title={t("lecturer.exams.review")} description={t("lecturer.exams.reviewHint")} />
        <CardContent className="space-y-4 pt-2">
          <DetailList
            items={[
              { label: t("lecturer.common.course"), value: course ? `${course.code} · ${course.name}` : "—" },
              { label: t("lecturer.exams.examTitle"), value: title.trim() || "—" },
              { label: t("lecturer.exams.examType"), value: examType ? t(`examTypes.${examType}`) : "—" },
              { label: t("lecturer.exams.rules"), value: rules.length },
              { label: t("admin.exams.totalQuestions"), value: totals.questions },
              { label: t("admin.exams.totalMarks"), value: formatNumber(totals.marks, locale, 2) },
            ]}
          />
          {missing && <Alert tone="warning">{t("lecturer.exams.fieldsRequired")}</Alert>}
          <FormError error={error} />
          <Button type="submit" className="w-full" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={busy}>{t("lecturer.exams.createAction")}</Button>
          <p className="text-xs text-muted">{t("lecturer.exams.createSubtitle")}</p>
        </CardContent>
      </Card>
    </form>
  );
}

export default function NewExamPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.exams"), href: "/lecturer/exams" }, { label: t("lecturer.exams.createTitle") }]} />}
        title={t("lecturer.exams.createTitle")}
        description={t("lecturer.exams.subtitle")}
      />
      <WithMyCourses>{(courses) => <NewExamForm courses={courses} />}</WithMyCourses>
    </>
  );
}
