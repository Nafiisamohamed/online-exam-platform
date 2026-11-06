"use client";

/**
 * The lecturer's schedule requests and decisions (GET /api/schedules, scoped
 * to the lecturer's exams by the server). A waiting request can be cancelled;
 * approving and rejecting belong to the registrar.
 */
import { CalendarClock, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FormError, ScheduleBadge } from "@/components/admin/admin-ui";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { cancelSchedule, lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { formatDate, formatTimeRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Schedule } from "@/types/admin";

export default function LecturerSchedulesPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const schedules = useApi<{ items: Schedule[] }>(lecturerPaths.schedules);
  const [cancelling, setCancelling] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setError(null);
    try {
      await cancelSchedule(cancelling.id);
      toast(t("lecturer.exams.cancelledToast"));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  };

  const columns: Column<Schedule>[] = [
    {
      key: "exam",
      header: t("admin.exams.examination"),
      primary: true,
      cell: (s) => (
        <Link href={`/lecturer/exams/${s.exam.id}`} className="group block min-w-0">
          <span className="block font-semibold text-foreground group-hover:text-accent-strong">{s.exam.title}</span>
          <span className="block text-xs text-muted">{s.exam.course.code} · {s.exam.course.name}</span>
        </Link>
      ),
    },
    {
      key: "window",
      header: t("admin.exams.window"),
      cell: (s) => (
        <span className="whitespace-nowrap">
          {formatDate(s.windowStart, locale)}
          <span className="block text-xs text-muted">{formatTimeRange(s.windowStart, s.windowEnd, locale)}</span>
        </span>
      ),
    },
    { key: "duration", header: t("admin.exams.duration"), cell: (s) => <span className="whitespace-nowrap">{t("admin.minutes", { count: s.durationMinutes })}</span> },
    {
      key: "status",
      header: t("admin.status"),
      cell: (s) => (
        <span className="flex flex-col items-end gap-1 md:items-start">
          <ScheduleBadge status={s.status} />
          {s.decidedBy && s.decidedAt && <span className="text-xs text-muted">{t("lecturer.schedules.decided", { name: s.decidedBy.fullName, date: formatDate(s.decidedAt, locale) })}</span>}
          {s.rejectionReason && <span className="text-xs text-danger">{t("admin.exams.rejectionReason", { reason: s.rejectionReason })}</span>}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("table.actions")}</span>,
      align: "right",
      cell: (s) => (s.status === "REQUESTED" ? <Button variant="ghost" size="sm" leftIcon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setCancelling(s)}>{t("lecturer.exams.cancelRequest")}</Button> : <span className="text-xs text-subtle">—</span>),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.schedules") }]} />}
        title={t("lecturer.schedules.title")}
        description={t("lecturer.schedules.subtitle")}
      />
      {error ? <div className="mb-4"><FormError error={error} /></div> : null}
      <Card className="overflow-hidden">
        <QueryState state={schedules} skeleton="h-48 w-full" className="p-5">
          {({ items }) =>
            items.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t("lecturer.schedules.empty")} />
            ) : (
              <DataTable columns={columns} rows={[...items].sort((a, b) => b.windowStart.localeCompare(a.windowStart))} rowKey={(s) => s.id} caption={t("lecturer.schedules.title")} />
            )
          }
        </QueryState>
      </Card>
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={t("lecturer.exams.cancelTitle")}
        description={t("lecturer.exams.cancelBody")}
        confirmLabel={t("lecturer.exams.cancelRequest")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={busy}
        onConfirm={cancel}
      />
    </>
  );
}
