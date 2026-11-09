"use client";

/**
 * The lecturer's faculties and courses. GET /api/my/faculties lists the faculties the lecturer is
 * assigned to; choosing one shows only the courses they teach there (GET /api/courses, which the
 * server already limits to the lecturer's own courses).
 */
import { Building2 } from "lucide-react";
import { useState } from "react";
import { CourseTable } from "@/components/admin/course-table";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { WithMyCourses } from "@/components/lecturer/course-picker";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/i18n";

interface MyFaculty { id: string; code: string; name: string; myCourses: number }

export default function LecturerCoursesPage() {
  const { t } = useI18n();
  const faculties = useApi<{ items: MyFaculty[] }>("/my/faculties");
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.courses") }]} />}
        title={t("lecturer.courses.title")}
        description={t("lecturer.courses.facultiesHint")}
      />
      <QueryState state={faculties} skeleton="h-24 w-full" className="mb-5">
        {({ items }) => items.length === 0 ? (
          <Card className="mb-5"><EmptyState icon={Building2} title={t("lecturer.courses.noFaculties")} description={t("lecturer.courses.noFacultiesHint")} /></Card>
        ) : (
          <div role="tablist" aria-label={t("lecturer.courses.myFaculties")} className="mb-5 flex flex-wrap gap-2">
            {[{ id: null as string | null, code: t("lecturer.courses.allFaculties"), name: "", myCourses: items.reduce((s, f) => s + f.myCourses, 0) }, ...items].map((f) => {
              const active = (chosen ?? null) === f.id;
              return (
                <button key={f.id ?? "all"} type="button" role="tab" aria-selected={active} onClick={() => setChosen(f.id)}
                  className={cn("rounded-xl border px-3.5 py-2 text-left text-sm transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:border-border-strong")}>
                  <span className="block font-semibold">{f.code}</span>
                  {f.name && <span className={cn("block max-w-56 truncate text-xs", active ? "opacity-90" : "text-muted")}>{f.name}</span>}
                  <span className={cn("block text-xs", active ? "opacity-90" : "text-muted")}>{t("lecturer.courses.courseCount", { count: f.myCourses })}</span>
                </button>
              );
            })}
          </div>
        )}
      </QueryState>
      <WithMyCourses>
        {(courses) => (
          <Card className="overflow-hidden">
            <CourseTable rows={chosen ? courses.filter((c) => c.facultyId === chosen) : courses} hideLecturer basePath="/lecturer/courses" empty={t("lecturer.courses.noCoursesInFaculty")} />
          </Card>
        )}
      </WithMyCourses>
    </>
  );
}
