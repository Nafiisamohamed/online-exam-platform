"use client";

/** The student's courses: GET /api/courses returns only their active enrolments. Searched in the browser. */
import { BookOpenCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Field, SearchInput } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { studentPaths } from "@/lib/api/student";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { Course } from "@/types/admin";

export default function StudentCoursesPage() {
  const { t } = useI18n();
  const courses = useApi<{ items: Course[] }>(studentPaths.courses);
  const [search, setSearch] = useState("");
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.courses") }]} />}
        title={t("student.courses.title")}
        description={t("student.courses.subtitle")}
      />
      <QueryState state={courses} skeleton="h-48 w-full">
        {({ items }) => {
          const q = search.trim().toLowerCase();
          const rows = q ? items.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) : items;
          return items.length === 0 ? (
            <Card><EmptyState icon={BookOpenCheck} title={t("student.courses.empty")} description={t("student.courses.emptyHint")} /></Card>
          ) : (
            <>
              <Card className="mb-4 p-4">
                <Field label={t("common.search")} className="max-w-md">
                  {({ id }) => <SearchInput id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("student.courses.search")} />}
                </Field>
              </Card>
              {rows.length === 0 ? (
                <Card><EmptyState title={t("table.noRows")} /></Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
                  {rows.map((c) => (
                    <Card key={c.id} interactive className="p-0">
                      <Link href={`/student/courses/${c.id}`} className="block space-y-2 p-5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-foreground">{c.code}</p>
                          <Badge tone="sky">{c.semester}</Badge>
                        </div>
                        <p className="text-sm text-text">{c.name}</p>
                        <p className="text-xs text-muted">{t("student.courses.lecturer")}: {c.lecturer.fullName} · {c.faculty.name}</p>
                      </Link>
                    </Card>
                  ))}
                </div>
              )}
            </>
          );
        }}
      </QueryState>
    </>
  );
}
