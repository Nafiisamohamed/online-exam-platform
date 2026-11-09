"use client";

/**
 * Academic years (registrar): GET /api/academic-years; create "2026/2027" with its dates, edit the
 * dates, and choose the current year (POST /api/academic-years/:id/activate). The server checks
 * the name, the dates and that only one year is current.
 */
import { CalendarCheck, PencilLine, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { activateAcademicYear, createAcademicYear, paths, updateAcademicYear } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { AcademicYear } from "@/types/admin";

const day = (iso: string) => iso.slice(0, 10);

function YearModal({ year, onClose }: { year?: AcademicYear; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const next = new Date().getFullYear();
  const [name, setName] = useState(year?.name ?? `${next}/${next + 1}`);
  const [startDate, setStartDate] = useState(year ? day(year.startDate) : "");
  const [endDate, setEndDate] = useState(year ? day(year.endDate) : "");
  const [isCurrent, setIsCurrent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (year) await updateAcademicYear(year.id, { startDate, endDate });
      else await createAcademicYear({ name: name.trim(), startDate, endDate, isCurrent });
      toast(t("admin.saved"));
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={year ? t("admin.academic.editYear", { name: year.name }) : t("admin.academic.addYear")}
      closeLabel={t("common.cancel")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="year-form" loading={busy} disabled={!name.trim() || !startDate || !endDate}>{t("common.save")}</Button>
        </>
      }
    >
      <form id="year-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />
        <Field label={t("admin.academic.yearName")} hint={t("admin.academic.yearNameHint")} required={!year}>
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={name} onChange={(e) => setName(e.target.value)} placeholder="2026/2027" maxLength={9} disabled={!!year} autoComplete="off" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.academic.startDate")} required>
            {({ id }) => <Input id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
          </Field>
          <Field label={t("admin.academic.endDate")} required>
            {({ id }) => <Input id={id} type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />}
          </Field>
        </div>
        {!year && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
            {t("admin.academic.makeCurrent")}
          </label>
        )}
      </form>
    </Modal>
  );
}

export default function AcademicYearsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const years = useApi<{ items: AcademicYear[] }>(paths.academicYears);
  const [modal, setModal] = useState<{ year?: AcademicYear } | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const activate = async (y: AcademicYear) => {
    setActivating(y.id);
    setError(null);
    try {
      await activateAcademicYear(y.id);
      toast(t("admin.academic.nowCurrent", { name: y.name }));
    } catch (err) {
      setError(err);
    } finally {
      setActivating(null);
    }
  };

  const columns: Column<AcademicYear>[] = [
    {
      key: "name",
      header: t("admin.academic.year"),
      primary: true,
      cell: (y) => <span className="flex items-center gap-2 font-semibold text-foreground">{y.name}{y.isCurrent && <Badge tone="success" dot>{t("admin.academic.current")}</Badge>}</span>,
    },
    { key: "dates", header: t("admin.academic.dates"), cell: (y) => <span className="whitespace-nowrap text-muted">{formatDate(y.startDate, locale)} – {formatDate(y.endDate, locale)}</span> },
    { key: "courses", header: t("admin.faculties.courses"), align: "right", cell: (y) => <span className="tabular-nums">{y.courses}</span> },
    { key: "students", header: t("admin.academic.registeredStudents"), align: "right", cell: (y) => <span className="tabular-nums">{y.registrations}</span>, className: "hidden sm:table-cell" },
    {
      key: "actions",
      header: <span className="sr-only">{t("table.actions")}</span>,
      align: "right",
      cell: (y) => (
        <span className="flex justify-end gap-1">
          {!y.isCurrent && (
            <Button variant="ghost" size="sm" leftIcon={<CalendarCheck className="h-3.5 w-3.5" />} loading={activating === y.id} onClick={() => activate(y)}>
              {t("admin.academic.setCurrent")}
            </Button>
          )}
          <Button variant="ghost" size="sm" leftIcon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setModal({ year: y })}>{t("common.edit")}</Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.academicYears") }]} />}
        title={t("admin.academic.yearsTitle")}
        description={t("admin.academic.yearsSubtitle")}
        actions={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({})}>{t("admin.academic.addYear")}</Button>}
      />
      <FormError error={error} />
      <Card className="overflow-hidden">
        {years.error && !years.data ? (
          <QueryError state={years} />
        ) : (
          <DataTable columns={columns} rows={years.data?.items ?? []} rowKey={(y) => y.id} loading={!years.data} emptyTitle={t("admin.academic.noYears")} caption={t("admin.academic.yearsTitle")} />
        )}
      </Card>
      {modal && <YearModal year={modal.year} onClose={() => setModal(null)} />}
    </>
  );
}
