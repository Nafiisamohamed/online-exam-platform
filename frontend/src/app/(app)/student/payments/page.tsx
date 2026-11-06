"use client";

/** The student's exam fee payments (GET /api/payments: own only), with receipts for successful ones. */
import { CreditCard } from "lucide-react";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { apiUrl } from "@/lib/api/client";
import { studentPaths } from "@/lib/api/student";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Payment, PaymentStatus } from "@/types/student";

const tone: Record<PaymentStatus, BadgeTone> = { SUCCESS: "success", FAILED: "danger", CANCELLED: "neutral", EXPIRED: "neutral", PENDING_CONFIRMATION: "warning", PENDING_PIN: "warning" };

export default function StudentPaymentsPage() {
  const { t, locale } = useI18n();
  const payments = useApi<{ items: Payment[] }>(studentPaths.payments());
  const columns: Column<Payment>[] = [
    {
      key: "exam",
      header: t("student.payments.exam"),
      primary: true,
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-foreground">{p.exam?.title ?? "—"}</span>
          <span className="block text-xs text-muted">{p.providerName} · {p.phone}</span>
        </span>
      ),
    },
    { key: "amount", header: t("student.payments.amount"), cell: (p) => <span className="whitespace-nowrap tabular-nums">{p.amount} {p.currency}</span> },
    { key: "status", header: t("admin.status"), cell: (p) => <Badge tone={tone[p.status]}>{t(`student.payments.status.${p.status}`)}</Badge> },
    { key: "date", header: t("student.payments.date"), cell: (p) => <span className="whitespace-nowrap text-muted">{formatDateTime(p.completedAt ?? p.createdAt, locale)}</span> },
    {
      key: "receipt",
      header: <span className="sr-only">{t("student.payments.receipt")}</span>,
      align: "right",
      cell: (p) => (p.status === "SUCCESS" ? <a href={apiUrl(studentPaths.receiptPdf(p.id, locale))} download className={buttonClasses("ghost", "sm")}>{t("student.payments.receipt")}</a> : <span className="text-xs text-subtle">—</span>),
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.payments") }]} />}
        title={t("student.payments.title")}
        description={t("student.payments.subtitle")}
      />
      <Alert tone="info" className="mb-4">{t("student.payments.simulated")}</Alert>
      <Card className="overflow-hidden">
        <QueryState state={payments} skeleton="h-40 w-full" className="p-5">
          {({ items }) => (items.length === 0 ? <EmptyState icon={CreditCard} title={t("student.payments.empty")} /> : <DataTable columns={columns} rows={items} rowKey={(p) => p.id} caption={t("student.payments.title")} />)}
        </QueryState>
      </Card>
    </>
  );
}
