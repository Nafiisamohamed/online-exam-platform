"use client";

/**
 * The lecturer's own courses (GET /api/courses is scoped to the lecturer by
 * the server) and a course chooser for pages that work per course (question
 * bank, CSV import). The chosen course is remembered while the tab is open,
 * so moving between pages keeps it.
 */
import { BookOpenCheck } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { QueryState } from "@/components/admin/query-state";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course } from "@/types/admin";

let chosen = "";
const listeners = new Set<() => void>();
const choiceStore = {
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => chosen,
  set: (id: string) => {
    chosen = id;
    listeners.forEach((l) => l());
  },
};

export function useMyCourses() {
  return useApi<{ items: Course[] }>(lecturerPaths.courses);
}

/** The chosen course id: the remembered one if it is still the lecturer's, else the first course. */
export function useChosenCourse(courses: Course[] | undefined): [string, (id: string) => void] {
  const value = useSyncExternalStore(choiceStore.subscribe, choiceStore.get, () => "");
  const valid = courses?.some((c) => c.id === value) ? value : courses?.[0]?.id ?? "";
  return [valid, choiceStore.set];
}

export function CourseSelect({ courses, value, onChange, className }: { courses: Course[]; value: string; onChange: (id: string) => void; className?: string }) {
  const { t } = useI18n();
  return (
    <Field label={t("lecturer.common.course")} className={className}>
      {({ id }) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.semester})</option>)}
        </Select>
      )}
    </Field>
  );
}

/** Loads the lecturer's courses; shows an empty state when there are none. */
export function WithMyCourses({ children }: { children: (courses: Course[]) => ReactNode }) {
  const { t } = useI18n();
  const courses = useMyCourses();
  return (
    <QueryState state={courses} skeleton="h-48 w-full">
      {({ items }) =>
        items.length === 0 ? (
          <Card><EmptyState icon={BookOpenCheck} title={t("lecturer.common.noCourses")} description={t("lecturer.common.noCoursesHint")} /></Card>
        ) : (
          children(items)
        )
      }
    </QueryState>
  );
}
