"use client";

/**
 * The student's semester fees (GET /api/my/fees): for each registered semester the fee, what was
 * paid, the outstanding balance and a "Pay semester fee" action (all or part of the balance), then
 * the payment history with receipts (older exam-fee payments are shown as history). Payments are
 * simulated: no money is moved.
 */
import { CreditCard, Wallet } from "lucide-react";
import { useState } from "react";
import { QueryState } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { PayDialog } from "@/components/student/pay-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { apiUrl } from "@/lib/api/client";
import { studentPaths } from "@/lib/api/student";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { MyFees, PaymentStatus, PayTarget } from "@/types/student";

const tone: Record<PaymentStatus, BadgeTone> = { SUCCESS: "success", FAILED: "danger", CANCELLED: "neutral", EXPIRED: "neutral", PENDING_CONFIRMATION: "warning", PENDING_PIN: "warning" };
type Row = MyFees["payments"][number];

export default function StudentPaymentsPage() {
  const { t, locale } = useI18n();
  const fees = useApi<MyFees>(studentPaths.myFees);
  const [paying, setPaying] = useState<PayTarget | null>(null);
  const money = (n: number, c: string) => `${n.toFixed(2)} ${c}`;

  const columns: Column<Row>[] = [
    {
      key: "for",
      header: t("student.fees.paidFor"),
      primary: true,
      cell: (p) => {
        const s = fees.data?.semesters.find((x) => x.fee?.id === p.semesterFeeId);
        return (
          <span className="block min-w-0">
            <span className="block font-semibold text-foreground">{p.kind === "SEMESTER_FEE" ? (s ? t("student.fees.semesterLabel", { n: s.semesterNumber, year: s.academicYear.name }) : t("student.fees.semesterFee")) : `${p.exam?.course ?? ""} · ${p.exam?.title ?? ""}`}</span>
            <span className="block text-xs text-muted">{p.kind === "EXAM_FEE" ? t("student.fees.oldExamFee") : p.provider === "EVC_PLUS" ? "EVC Plus" : p.provider === "ZAAD" ? "Zaad" : "eDahab"}</span>
          </span>
        );
      },
    },
    { key: "amount", header: t("student.payments.amount"), cell: (p) => <span className="whitespace-nowrap tabular-nums">{money(p.amount, p.currency)}</span> },
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
        title={t("student.fees.title")}
        description={t("student.fees.subtitle")}
      />
      <Alert tone="info" className="mb-4">{t("student.payments.simulated")}</Alert>
      <QueryState state={fees} skeleton="h-56 w-full">
        {({ semesters, payments }) => (
          <>
            {semesters.length === 0 ? (
              <Card className="mb-6"><EmptyState icon={Wallet} title={t("student.fees.noSemesters")} description={t("student.fees.noSemestersHint")} /></Card>
            ) : (
              <div className="mb-6 grid gap-4 md:grid-cols-2">
                {semesters.map((s) => (
                  <Card key={`${s.academicYear.id}-${s.semesterNumber}`}>
                    <CardHeader title={t("student.fees.semesterLabel", { n: s.semesterNumber, year: s.academicYear.name })} description={`${s.faculty.code} · ${s.faculty.name}`} />
                    <CardContent className="space-y-3">
                      {!s.fee ? (
                        <p className="text-sm text-muted">{t("student.fees.noFee")}</p>
                      ) : (
                        <>
                          <dl className="grid grid-cols-3 gap-2 text-sm">
                            <div><dt className="text-xs text-muted">{t("student.fees.total")}</dt><dd className="font-semibold tabular-nums text-foreground">{money(s.fee.amount, s.fee.currency)}</dd></div>
                            <div><dt className="text-xs text-muted">{t("student.fees.paid")}</dt><dd className="font-semibold tabular-nums text-success">{money(s.paid, s.fee.currency)}</dd></div>
                            <div><dt className="text-xs text-muted">{t("student.fees.outstanding")}</dt><dd className="font-semibold tabular-nums text-foreground">{money(s.outstanding, s.fee.currency)}</dd></div>
                          </dl>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={s.percentPaid} aria-valuemin={0} aria-valuemax={100} aria-label={t("student.fees.percentPaid", { percent: s.percentPaid })}>
                            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${s.percentPaid}%` }} />
                          </div>
                          <p className="text-xs text-muted">{t("student.fees.percentPaid", { percent: s.percentPaid })} · {t("student.fees.thresholds")}</p>
                          {s.outstanding > 0 ? (
                            <Button leftIcon={<CreditCard className="h-4 w-4" />} onClick={() => setPaying({ feeId: s.fee!.id, label: t("student.fees.semesterLabel", { n: s.semesterNumber, year: s.academicYear.name }), outstanding: s.outstanding, currency: s.fee!.currency })}>{t("student.fees.pay")}</Button>
                          ) : (
                            <Badge tone="success" dot>{t("student.fees.paidInFull")}</Badge>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <Card className="overflow-hidden">
              <CardHeader title={t("student.fees.history")} className="pb-4" />
              {payments.length === 0 ? <EmptyState icon={CreditCard} title={t("student.payments.empty")} /> : <DataTable columns={columns} rows={payments} rowKey={(p) => p.id} caption={t("student.fees.history")} />}
            </Card>
          </>
        )}
      </QueryState>
      {paying && <PayDialog target={paying} onClose={() => setPaying(null)} />}
    </>
  );
}
