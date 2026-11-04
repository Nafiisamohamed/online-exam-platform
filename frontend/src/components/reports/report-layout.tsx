"use client";

/**
 * Layout for report pages: a filter bar (date range plus any page-specific
 * filters), an export area, and the report body (charts, tables). Pages pass
 * their own filters and export handlers; the layout keeps every report
 * looking the same.
 */
import { CalendarRange, Download, FileSpreadsheet, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/i18n";

export interface DateRange {
  from: string;
  to: string;
}

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (value: DateRange) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
        <CalendarRange className="h-3.5 w-3.5" aria-hidden /> {t("reports.dateRange")}
      </legend>
      <div className="flex items-center gap-2">
        <Input type="date" className="min-w-0 flex-1 px-2.5" aria-label={t("common.from")} value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        <span className="text-subtle" aria-hidden>–</span>
        <Input type="date" className="min-w-0 flex-1 px-2.5" aria-label={t("common.to")} value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </div>
    </fieldset>
  );
}

export function ReportLayout({
  filters, onReset, onExportCsv, onExportPdf, children,
}: {
  filters: ReactNode;
  onReset?: () => void;
  onExportCsv?: () => void;
  onExportPdf?: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">{filters}</div>
          <div className="flex flex-wrap items-center gap-2">
            {onReset && <Button variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={onReset}>{t("common.reset")}</Button>}
            {onExportCsv && <Button variant="secondary" leftIcon={<FileSpreadsheet className="h-4 w-4" />} onClick={onExportCsv}>{t("common.exportCsv")}</Button>}
            {onExportPdf && <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={onExportPdf}>{t("common.exportPdf")}</Button>}
          </div>
        </div>
      </Card>
      {children}
    </div>
  );
}
