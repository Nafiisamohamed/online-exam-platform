"use client";

/**
 * Account additions on the profile page, only where the backend supports them:
 * - the language used for the user's SMS and notifications (PATCH /api/auth/language);
 * - for students, the faculties of their enrolled courses (from GET /api/courses),
 *   since the profile endpoint has no faculty field.
 * Nothing else about the profile can be edited through the API yet.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { FormError } from "@/components/admin/admin-ui";
import { savePreferredLanguage, studentPaths } from "@/lib/api/student";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import type { Course } from "@/types/admin";

/** Faculty names of the student's active courses, or undefined while loading / for other roles. */
export function useStudentFaculties(): string | undefined {
  const { role, isPreview } = useSession();
  const courses = useApi<{ items: Course[] }>(role === "STUDENT" && !isPreview ? studentPaths.courses : null);
  if (!courses.data) return undefined;
  return [...new Set(courses.data.items.map((c) => c.faculty.name))].join(", ") || "—";
}

export function AccountPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const { profile, isPreview } = useSession();
  const [language, setLanguage] = useState<"so" | "en">(profile.preferredLanguage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (isPreview) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePreferredLanguage(language);
      toast(t("student.profile.languageSaved"));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t("student.profile.serverLanguage")} description={t("student.profile.serverLanguageHint")} />
      <CardContent className="space-y-3">
        <FormError error={error} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t("profile.language")} className="sm:w-56">
            {({ id }) => (
              <Select id={id} value={language} onChange={(e) => setLanguage(e.target.value as "so" | "en")}>
                <option value="so">{t("language.so")}</option>
                <option value="en">{t("language.en")}</option>
              </Select>
            )}
          </Field>
          <Button onClick={save} loading={busy} disabled={language === profile.preferredLanguage && !error}>{t("common.save")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
