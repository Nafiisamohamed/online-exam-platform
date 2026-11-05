"use client";

/** Faculty management: GET /api/faculties (all faculties with their course count), searched in the browser. */
import { Building2, PencilLine, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar } from "@/components/admin/admin-ui";
import { FacultyModal } from "@/components/admin/faculty-forms";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, SearchInput } from "@/components/ui/form";
import { paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Faculty } from "@/types/admin";

export default function FacultiesPage() {
  const { t, locale } = useI18n();
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ faculty?: Faculty } | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = faculties.data?.items ?? [];
    return q ? all.filter((f) => f.code.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)) : all;
  }, [faculties.data, search]);

  const columns: Column<Faculty>[] = [
    {
      key: "name",
      header: t("admin.faculties.name"),
      primary: true,
      cell: (f) => (
        <Link href={`/admin/faculties/${f.id}`} className="group flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><Building2 className="h-4 w-4" aria-hidden /></span>
          <span className="font-semibold text-foreground group-hover:text-accent-strong">{f.name}</span>
        </Link>
      ),
    },
    { key: "code", header: t("admin.faculties.code"), cell: (f) => <span className="font-mono text-xs font-semibold">{f.code}</span> },
    { key: "courses", header: t("admin.faculties.courses"), align: "right", cell: (f) => <span className="tabular-nums">{f._count.courses}</span> },
    { key: "created", header: t("admin.created"), cell: (f) => <span className="text-muted">{formatDate(f.createdAt, locale)}</span>, className: "hidden lg:table-cell" },
    {
      key: "actions",
      header: <span className="sr-only">{t("table.actions")}</span>,
      align: "right",
      cell: (f) => (
        <Button variant="ghost" size="sm" leftIcon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setModal({ faculty: f })}>
          {t("admin.faculties.rename")}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.faculties") }]} />}
        title={t("admin.faculties.title")}
        description={t("admin.faculties.subtitle")}
        actions={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({})}>{t("admin.faculties.add")}</Button>}
      />
      <Alert tone="info" className="mb-4">{t("admin.faculties.noDelete")}</Alert>
      <FilterBar>
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.faculties.search")} />}
        </Field>
      </FilterBar>
      <Card className="overflow-hidden">
        {faculties.error && !faculties.data ? (
          <QueryError state={faculties} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(f) => f.id} loading={!faculties.data} emptyTitle={t("table.noRows")} caption={t("admin.faculties.title")} />
        )}
      </Card>
      {modal && <FacultyModal faculty={modal.faculty} open onOpenChange={(o) => !o && setModal(null)} />}
    </>
  );
}
