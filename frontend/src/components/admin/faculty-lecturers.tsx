"use client";

/**
 * Lecturers assigned to one faculty (GET/POST/DELETE /api/faculties/:id/lecturers). Only assigned
 * lecturers can teach the faculty's courses; one who still teaches a course here cannot be
 * removed until the course has another lecturer (the server refuses it too).
 */
import { UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { assignLecturer, paths, unassignLecturer } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { FacultyLecturer, StaffMember } from "@/types/admin";
import { FormError } from "./admin-ui";
import { QueryState } from "./query-state";

export function FacultyLecturers({ facultyId }: { facultyId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const assigned = useApi<{ items: FacultyLecturer[] }>(paths.facultyLecturers(facultyId));
  const staff = useApi<{ items: StaffMember[] }>(paths.staff("LECTURER"));
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const assignedIds = new Set((assigned.data?.items ?? []).map((l) => l.id));
  const available = (staff.data?.items ?? []).filter((l) => !assignedIds.has(l.id));

  const run = async (key: string, action: () => Promise<void>, done: string) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      toast(done);
      setChoice("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader title={t("admin.academic.facultyLecturers")} description={t("admin.academic.facultyLecturersHint")} />
      <CardContent className="space-y-4">
        <FormError error={error} />
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("admin.academic.assignLecturer")} className="min-w-64 flex-1">
            {({ id }) => (
              <Select id={id} value={choice} onChange={(e) => setChoice(e.target.value)} disabled={!staff.data || available.length === 0}>
                <option value="">{available.length ? t("admin.courses.chooseLecturer") : t("admin.academic.allLecturersAssigned")}</option>
                {available.map((l) => <option key={l.id} value={l.id}>{l.fullName}</option>)}
              </Select>
            )}
          </Field>
          <Button leftIcon={<UserPlus className="h-4 w-4" />} disabled={!choice} loading={busy === "assign"}
            onClick={() => run("assign", () => assignLecturer(facultyId, choice), t("admin.academic.lecturerAssigned"))}>
            {t("admin.academic.assign")}
          </Button>
        </div>
        <QueryState state={assigned} skeleton="h-24 w-full">
          {({ items }) => items.length === 0 ? (
            <p className="text-sm text-muted">{t("admin.academic.noFacultyLecturers")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {items.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{l.fullName}</span>
                    <span className="block text-xs text-muted">{l.username}{l.email ? ` · ${l.email}` : ""}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={l.coursesInFaculty ? "sky" : "neutral"}>{t("admin.academic.coursesHere", { count: l.coursesInFaculty })}</Badge>
                    <Button variant="ghost" size="sm" leftIcon={<UserMinus className="h-3.5 w-3.5" />} disabled={l.coursesInFaculty > 0} loading={busy === l.id}
                      title={l.coursesInFaculty > 0 ? t("errors.LECTURER_TEACHES_IN_FACULTY") : undefined}
                      onClick={() => run(l.id, () => unassignLecturer(facultyId, l.id), t("admin.academic.lecturerRemoved"))}>
                      {t("admin.academic.remove")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
    </Card>
  );
}
