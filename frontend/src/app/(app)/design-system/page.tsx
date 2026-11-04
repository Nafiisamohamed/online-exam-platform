"use client";

/**
 * Design-system gallery: every shared component in one place, so colours,
 * spacing and states can be reviewed (in both themes and both languages)
 * before modules are built. Example rows use the seeded demo courses.
 */
import { Bell, CalendarClock, Download, Plus, Settings, Trash2, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BarChartView } from "@/components/charts/charts";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/layout/app-shell";
import { DateRangeFilter, ReportLayout, type DateRange } from "@/components/reports/report-layout";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, SearchInput, Select, Textarea } from "@/components/ui/form";
import {
  ConfirmDialog, Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, Modal, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip,
} from "@/components/ui/overlays";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton, Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useI18n } from "@/lib/i18n/i18n";
import { SAMPLE_SCORE_BANDS } from "@/lib/preview/sample-analytics";

const SWATCHES = [
  { name: "Navy 900", value: "#142D50", className: "bg-[var(--navy-900)]" },
  { name: "Navy 800", value: "#1D3B61", className: "bg-[var(--navy-800)]" },
  { name: "Navy 600", value: "#3A6496", className: "bg-[var(--navy-600)]" },
  { name: "Sky 500", value: "#55B8E8", className: "bg-[var(--sky-500)]" },
  { name: "Sky 700", value: "#1F7FB3", className: "bg-[var(--sky-700)]" },
  { name: "Sky 50", value: "#EAF6FC", className: "bg-[var(--sky-50)]" },
  { name: "Cream", value: "#F7F4EC", className: "bg-[#f7f4ec]" },
  { name: "Surface", value: "#FAFBFD", className: "bg-[#fafbfd]" },
];

interface ExampleRow {
  code: string;
  name: string;
  lecturer: string;
  students: number;
  status: "PUBLISHED" | "DRAFT";
}
const EXAMPLE_ROWS: ExampleRow[] = [
  { code: "CS201", name: "Database Systems", lecturer: "Dr. Axmed Xirsi Samatar", students: 8, status: "PUBLISHED" },
  { code: "CS105", name: "Introduction to Programming", lecturer: "Dr. Mustafe Cabdi Jibriil", students: 40, status: "PUBLISHED" },
  { code: "BA110", name: "Principles of Accounting", lecturer: "Dr. Khadra Maxamuud Cilmi", students: 5, status: "DRAFT" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function DesignSystemPage() {
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(2);
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });

  const columns: Column<ExampleRow>[] = [
    { key: "code", header: t("reports.course"), primary: true, cell: (r) => <span className="font-semibold text-foreground">{r.code} · {r.name}</span> },
    { key: "lecturer", header: t("roles.LECTURER"), cell: (r) => r.lecturer },
    { key: "students", header: t("dashboard.charts.students"), align: "right", cell: (r) => r.students },
    { key: "status", header: t("reports.status"), cell: (r) => <Badge tone={r.status === "PUBLISHED" ? "sky" : "neutral"} dot>{r.status === "PUBLISHED" ? "Published" : "Draft"}</Badge> },
  ];

  return (
    <>
      <PageHeader title={t("designSystem.title")} description={t("designSystem.subtitle")} />
      <div className="space-y-6">
        <Section title={t("designSystem.colors")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {SWATCHES.map((s) => (
              <div key={s.name} className="overflow-hidden rounded-xl border border-border">
                <div className={`h-16 ${s.className}`} />
                <div className="px-2.5 py-2">
                  <p className="text-xs font-semibold text-foreground">{s.name}</p>
                  <p className="font-mono text-[11px] text-muted">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title={t("designSystem.buttons")}>
            <div className="flex flex-wrap gap-3">
              <Button leftIcon={<Plus className="h-4 w-4" />}>{t("common.save")}</Button>
              <Button variant="secondary">{t("common.apply")}</Button>
              <Button variant="outline" leftIcon={<Download className="h-4 w-4" />}>{t("common.export")}</Button>
              <Button variant="ghost">{t("common.cancel")}</Button>
              <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />}>{t("common.delete")}</Button>
              <Button loading>{t("common.loading")}</Button>
              <Button disabled>{t("common.confirm")}</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Tooltip content={t("profile.settings")}>
                <Button size="icon" variant="outline" aria-label={t("profile.settings")}><Settings className="h-4 w-4" /></Button>
              </Tooltip>
            </div>
          </Section>

          <Section title={t("designSystem.forms")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("profile.fullName")} required>
                {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} placeholder="Hodan Maxamed Cali" />}
              </Field>
              <Field label={t("profile.email")} error="Enter a valid email address">
                {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} defaultValue="registrar@" />}
              </Field>
              <Field label={t("reports.course")} hint={t("common.optional")}>
                {({ id, describedBy }) => (
                  <Select id={id} aria-describedby={describedBy} defaultValue="CS201">
                    {EXAMPLE_ROWS.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label={t("common.search")}>
                {({ id }) => <SearchInput id={id} placeholder={t("topbar.search")} />}
              </Field>
              <Field label={t("designSystem.modalTitle")} className="sm:col-span-2">
                {({ id }) => <Textarea id={id} placeholder={t("designSystem.modalBody")} />}
              </Field>
            </div>
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title={t("designSystem.feedback")}>
            <div className="flex flex-wrap gap-2">
              <Badge tone="navy">Navy</Badge>
              <Badge tone="sky" dot>In progress</Badge>
              <Badge tone="neutral">Draft</Badge>
              <Badge tone="success" dot>Submitted</Badge>
              <Badge tone="warning" dot>Disconnected</Badge>
              <Badge tone="danger" dot>Rejected</Badge>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <Spinner className="text-accent" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-dashed border-border-strong"><EmptyState title={t("states.emptyTitle")} description={t("states.emptyHint")} className="py-8" /></div>
              <div className="rounded-xl border border-dashed border-border-strong">
                <ErrorState title={t("states.errorTitle")} description={t("states.errorHint")} className="py-8" action={<Button size="sm" variant="secondary">{t("common.retry")}</Button>} />
              </div>
            </div>
          </Section>

          <Section title={t("designSystem.overlays")}>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setModalOpen(true)}>{t("designSystem.openModal")}</Button>
              <Button onClick={() => setConfirmOpen(true)}>{t("designSystem.openConfirm")}</Button>
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="outline">{t("table.actions")}</Button>
                </DropdownTrigger>
                <DropdownContent align="start">
                  <DropdownItem icon={<UserRound className="h-4 w-4" />}>{t("profile.viewProfile")}</DropdownItem>
                  <DropdownItem icon={<CalendarClock className="h-4 w-4" />}>{t("nav.schedules")}</DropdownItem>
                  <DropdownItem icon={<Bell className="h-4 w-4" />}>{t("topbar.notifications")}</DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem icon={<Trash2 className="h-4 w-4" />} className="text-danger data-[highlighted]:text-danger">{t("common.delete")}</DropdownItem>
                </DropdownContent>
              </Dropdown>
            </div>
            <Tabs defaultValue="overview" className="mt-6">
              <TabsList>
                <TabsTrigger value="overview">{t("nav.dashboard")}</TabsTrigger>
                <TabsTrigger value="results">{t("nav.results")}</TabsTrigger>
                <TabsTrigger value="analytics">{t("nav.analytics")}</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="pt-4 text-sm text-muted">{t("dashboard.subtitle")}</TabsContent>
              <TabsContent value="results" className="pt-4 text-sm text-muted">{t("nav.results")}</TabsContent>
              <TabsContent value="analytics" className="pt-4 text-sm text-muted">{t("dashboard.charts.difficultyHint")}</TabsContent>
            </Tabs>
            <div className="mt-6 flex items-center gap-3">
              <Avatar name="Hodan Maxamed Cali" size="sm" />
              <Avatar name="Dr. Axmed Xirsi Samatar" size="md" online />
              <Avatar name="Sahra Cabdirashiid Mire" size="lg" ring />
            </div>
          </Section>
        </div>

        <Card>
          <CardHeader title={t("designSystem.data")} action={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.courses") }]} />} />
          <div className="mt-4 border-t border-border">
            <DataTable columns={columns} rows={EXAMPLE_ROWS} rowKey={(r) => r.code} caption={t("nav.courses")} />
          </div>
          <div className="border-t border-border px-5 py-4 sm:px-6">
            <Pagination page={page} pageSize={10} total={53} onPageChange={setPage} />
          </div>
        </Card>

        <ReportLayout
          filters={
            <>
              <DateRangeFilter value={range} onChange={setRange} />
              <Field label={t("reports.course")}>
                {({ id }) => (
                  <Select id={id} defaultValue="">
                    <option value="">{t("common.all")}</option>
                    {EXAMPLE_ROWS.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
                  </Select>
                )}
              </Field>
              <Field label={t("reports.status")}>
                {({ id }) => (
                  <Select id={id} defaultValue="">
                    <option value="">{t("common.all")}</option>
                  </Select>
                )}
              </Field>
            </>
          }
          onReset={() => setRange({ from: "", to: "" })}
          onExportCsv={() => undefined}
          onExportPdf={() => undefined}
        >
          <ChartCard title={t("dashboard.charts.scoreDistribution")} description={t("dashboard.charts.scoreDistributionHint")} sample={{ label: t("preview.sampleData"), hint: t("preview.sampleDataHint") }} height={240}>
            <BarChartView data={SAMPLE_SCORE_BANDS} xKey="band" series={[{ key: "students", label: t("dashboard.charts.students") }]} />
          </ChartCard>
        </ReportLayout>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={t("designSystem.modalTitle")}
        description={t("designSystem.modalBody")}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => setModalOpen(false)}>{t("common.save")}</Button>
          </>
        }
      >
        <Field label={t("profile.fullName")}>{({ id }) => <Input id={id} defaultValue="Hodan Maxamed Cali" />}</Field>
      </Modal>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("designSystem.confirmTitle")}
        description={t("designSystem.confirmBody")}
        confirmLabel={t("designSystem.confirmAction")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => setConfirmOpen(false)}
      />
    </>
  );
}
