"use client";

/**
 * Semester fees (registrar): set the fee of each faculty and semester for an academic year
 * (GET/POST/PATCH /api/semester-fees), see who has paid in full, in part or not at all
 * (GET /api/fee-status) and send payment reminders (POST /api/fee-reminders: simulated SMS and an
 * in-app notice). Amounts are entered by the registrar; none are built in.
 */
import { BellRing, PencilLine, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FilterBar, FormError } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useDebounced } from "@/hooks/use-debounced";
import { paths, saveFee, sendFeeReminders } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import { SEMESTERS, type AcademicYear, type Faculty, type FeeStatusPage, type SemesterFee } from "@/types/admin";

const PAGE_SIZE = 25;
const STATUS_TONE: Record<string, BadgeTone> = { PAID: "success", PARTIAL: "warning", UNPAID: "danger", NO_FEE: "neutral" };

function FeeModal({ yearId, fee, faculties, onClose }: { yearId: string; fee?: SemesterFee; faculties: Faculty[]; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [facultyId, setFacultyId] = useState(fee?.faculty.id ?? "");
  const [semesterNumber, setSemesterNumber] = useState(fee ? String(fee.semesterNumber) : "");
  const [amount, setAmount] = useState(fee ? String(fee.amount) : "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const ok = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0 && !!facultyId && !!semesterNumber;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await saveFee(fee?.id ?? null, fee ? { amount: Number(amount) } : { academicYearId: yearId, facultyId, semesterNumber: Number(semesterNumber), amount: Number(amount) });
      toast(t("admin.saved"));
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={fee ? t("admin.fees.editTitle") : t("admin.fees.addTitle")} closeLabel={t("common.cancel")}
      footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="fee-form" loading={busy} disabled={!ok}>{t("common.save")}</Button></>}>
      <form id="fee-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.courses.faculty")} required>
            {({ id }) => (
              <Select id={id} value={facultyId} onChange={(e) => setFacultyId(e.target.value)} disabled={!!fee}>
                <option value="">{t("admin.courses.chooseFaculty")}</option>
                {faculties.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("admin.academic.semester")} required>
            {({ id }) => (
              <Select id={id} value={semesterNumber} onChange={(e) => setSemesterNumber(e.target.value)} disabled={!!fee}>
                <option value="">{t("admin.academic.chooseSemester")}</option>
                {SEMESTERS.map((n) => <option key={n} value={n}>{t("admin.academic.semesterN", { n })}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("admin.fees.amount")} hint={t("admin.fees.amountHint")} required>
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="sm:w-48" />}
        </Field>
      </form>
    </Modal>
  );
}

export default function FeesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const years = useApi<{ items: AcademicYear[] }>(paths.academicYears);
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const yearId = yearChoice ?? years.data?.items.find((y) => y.isCurrent)?.id ?? years.data?.items[0]?.id ?? "";
  const fees = useApi<{ items: SemesterFee[] }>(yearId ? paths.semesterFees(yearId) : null);
  const [facultyId, setFacultyId] = useState("");
  const [semesterNumber, setSemesterNumber] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim());
  const filters = { academicYearId: yearId, facultyId: facultyId || undefined, semesterNumber: semesterNumber ? Number(semesterNumber) : undefined };
  const statusList = useApi<FeeStatusPage>(yearId ? paths.feeStatus({ ...filters, status: status || undefined, search: term || undefined, page, pageSize: PAGE_SIZE }) : null, { keepPrevious: true });
  const [modal, setModal] = useState<{ fee?: SemesterFee } | null>(null);
  const [reminding, setReminding] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const money = (n: number, c: string) => `${n.toFixed(2)} ${c}`;
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const remind = async () => {
    setReminding(true);
    setError(null);
    try {
      const r = await sendFeeReminders(filters);
      toast(t("admin.fees.reminded", { count: r.reminded }));
    } catch (err) {
      setError(err);
    } finally {
      setReminding(false);
    }
  };

  const feeColumns: Column<SemesterFee>[] = [
    { key: "faculty", header: t("admin.courses.faculty"), primary: true, cell: (f) => <span title={f.faculty.name} className="font-semibold text-foreground">{f.faculty.code}</span> },
    { key: "semester", header: t("admin.academic.semester"), cell: (f) => t("admin.academic.semesterN", { n: f.semesterNumber }) },
    { key: "amount", header: t("admin.fees.amount"), align: "right", cell: (f) => <span className="tabular-nums">{money(f.amount, f.currency)}</span> },
    { key: "actions", header: <span className="sr-only">{t("table.actions")}</span>, align: "right", cell: (f) => <Button variant="ghost" size="sm" leftIcon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setModal({ fee: f })}>{t("common.edit")}</Button> },
  ];
  type StatusRow = FeeStatusPage["items"][number];
  const statusColumns: Column<StatusRow>[] = [
    { key: "student", header: t("admin.enrolment.student"), primary: true, cell: (r) => <span className="block min-w-0"><span className="block font-semibold text-foreground">{r.student.fullName}</span><span className="block text-xs text-muted">{r.student.username}</span></span> },
    { key: "group", header: t("admin.fees.group"), cell: (r) => `${r.faculty.code} · ${t("admin.academic.semesterN", { n: r.semesterNumber })}` },
    { key: "paid", header: t("admin.fees.paid"), align: "right", cell: (r) => (r.fee ? <span className="tabular-nums">{money(r.paid, r.fee.currency)} / {money(r.fee.amount, r.fee.currency)}</span> : "—") },
    { key: "outstanding", header: t("admin.fees.outstanding"), align: "right", cell: (r) => (r.fee ? <span className="tabular-nums">{money(r.outstanding, r.fee.currency)}</span> : "—"), className: "hidden md:table-cell" },
    { key: "status", header: t("admin.status"), cell: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{t(`admin.fees.status.${r.status}`)}</Badge> },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.fees") }]} />}
        title={t("admin.fees.title")}
        description={t("admin.fees.subtitle")}
        actions={
          <Field label={t("admin.academic.year")}>
            {({ id }) => (
              <Select id={id} value={yearId} onChange={(e) => { setYearChoice(e.target.value); setPage(1); }}>
                {years.data?.items.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </Select>
            )}
          </Field>
        }
      />
      {years.data && years.data.items.length === 0 && <Alert tone="warning" className="mb-4">{t("admin.courses.noYears")}</Alert>}
      <FormError error={error} />

      <Card className="mb-6 overflow-hidden">
        <CardHeader title={t("admin.fees.configured")} description={t("admin.fees.configuredHint")} className="pb-4"
          action={<Button size="sm" leftIcon={<Plus className="h-4 w-4" />} disabled={!yearId || !faculties.data} onClick={() => setModal({})}>{t("admin.fees.add")}</Button>} />
        {fees.error && !fees.data ? <QueryError state={fees} /> : <DataTable columns={feeColumns} rows={fees.data?.items ?? []} rowKey={(f) => f.id} loading={!!yearId && !fees.data} emptyTitle={t("admin.fees.noFees")} caption={t("admin.fees.configured")} />}
      </Card>

      {statusList.data && statusList.data.missingFees.length > 0 && (
        <Alert tone="warning" className="mb-4">{t("admin.fees.missing", { list: statusList.data.missingFees.map((m) => `${m.faculty.code} · ${t("admin.academic.semesterN", { n: m.semesterNumber })}`).join(", ") })}</Alert>
      )}

      <FilterBar actions={<Button variant="secondary" leftIcon={<BellRing className="h-4 w-4" />} loading={reminding} disabled={!yearId} onClick={remind}>{t("admin.fees.remind")}</Button>}>
        <Field label={t("admin.courses.faculty")}>
          {({ id }) => (
            <Select id={id} value={facultyId} onChange={(e) => filter(setFacultyId)(e.target.value)}>
              <option value="">{t("admin.faculties.allFaculties")}</option>
              {faculties.data?.items.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.academic.semester")}>
          {({ id }) => (
            <Select id={id} value={semesterNumber} onChange={(e) => filter(setSemesterNumber)(e.target.value)}>
              <option value="">{t("admin.courses.allSemesters")}</option>
              {SEMESTERS.map((n) => <option key={n} value={n}>{t("admin.academic.semesterN", { n })}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.status")}>
          {({ id }) => (
            <Select id={id} value={status} onChange={(e) => filter(setStatus)(e.target.value)}>
              <option value="">{t("admin.allStatuses")}</option>
              {(["PAID", "PARTIAL", "UNPAID", "NO_FEE"] as const).map((s) => <option key={s} value={s}>{t(`admin.fees.status.${s}`)}{statusList.data ? ` (${statusList.data.counts[s]})` : ""}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => filter(setSearch)(e.target.value)} placeholder={t("admin.academic.searchStudent")} />}
        </Field>
      </FilterBar>
      <Card className="overflow-hidden">
        {statusList.error && !statusList.data ? <QueryError state={statusList} /> : (
          <DataTable columns={statusColumns} rows={statusList.data?.items ?? []} rowKey={(r) => r.registrationId} loading={!!yearId && !statusList.data} emptyTitle={t("admin.fees.noStudents")} caption={t("admin.fees.statusTitle")} />
        )}
        {statusList.data && statusList.data.total > 0 && (
          <div className="border-t border-border px-5 py-4"><Pagination page={statusList.data.page} pageSize={statusList.data.pageSize} total={statusList.data.total} onPageChange={setPage} /></div>
        )}
      </Card>
      {modal && faculties.data && <FeeModal yearId={yearId} fee={modal.fee} faculties={faculties.data.items} onClose={() => setModal(null)} />}
    </>
  );
}
