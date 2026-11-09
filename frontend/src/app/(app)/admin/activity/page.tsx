"use client";

/**
 * Activity History (registrar): GET /api/audit-logs with filters for the person (name, username
 * or email), their role, the action and a date range, paged on the server. The export
 * (GET /api/audit-logs.csv) uses the same filters; the file is written by the server in the
 * language chosen here, not in the screen language.
 */
import { Download } from "lucide-react";
import { useState } from "react";
import { FilterBar, RoleBadge } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { DateRangeFilter, type DateRange } from "@/components/reports/report-layout";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { useDebounced } from "@/hooks/use-debounced";
import { paths, type AuditQuery } from "@/lib/api/admin";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/i18n/i18n";
import { adminEn } from "@/lib/i18n/messages/admin.en";
import type { AuditEntry, Paged } from "@/types/admin";
import { ROLES, type Role } from "@/types/account";

const PAGE_SIZE = 25;
const ACTIONS = Object.keys(adminEn.audit.actions) as (keyof typeof adminEn.audit.actions)[];

/** A date picked on screen (YYYY-MM-DD) as the start or end of that day in Mogadishu (UTC+3). */
const dayStart = (d: string) => (d ? `${d}T00:00:00+03:00` : undefined);
const dayEnd = (d: string) => (d ? `${d}T23:59:59.999+03:00` : undefined);

export default function ActivityHistoryPage() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [action, setAction] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [exportLang, setExportLang] = useState<"so" | "en">(locale);
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim());

  const filters: AuditQuery = {
    search: term || undefined, role: role || undefined, action: action || undefined,
    from: dayStart(range.from), to: dayEnd(range.to),
  };
  const logs = useApi<Paged<AuditEntry>>(paths.auditLogs({ ...filters, page, pageSize: PAGE_SIZE }), { keepPrevious: true });

  // Any filter change starts again at page 1.
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const actionText = (code: string) => (Object.hasOwn(adminEn.audit.actions, code) ? t(`admin.audit.actions.${code}` as MessageKey) : code);

  const columns: Column<AuditEntry>[] = [
    { key: "when", header: t("admin.activity.when"), cell: (e) => <span className="whitespace-nowrap tabular-nums text-muted">{formatDateTime(e.createdAt, locale)}</span> },
    {
      key: "user",
      header: t("admin.activity.user"),
      primary: true,
      cell: (e) => e.actor
        ? <span className="block min-w-0"><span className="block font-semibold text-foreground">{e.actor.fullName}</span><span className="block text-xs text-muted">{e.actor.username}</span></span>
        : <span className="text-muted">{t("admin.audit.system")}</span>,
    },
    { key: "role", header: t("admin.users.role"), cell: (e) => (e.actor ? <RoleBadge role={e.actor.role.name} /> : <span className="text-muted">—</span>) },
    { key: "action", header: t("admin.activity.action"), cell: (e) => <span className="text-foreground">{actionText(e.actionCode)}</span> },
    { key: "record", header: t("admin.activity.record"), cell: (e) => <span className="text-muted">{Object.hasOwn(adminEn.activity.entities, e.entityType) ? t(`admin.activity.entities.${e.entityType}` as MessageKey) : e.entityType}</span>, className: "hidden lg:table-cell" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.activity") }]} />}
        title={t("admin.activity.title")}
        description={t("admin.activity.subtitle")}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("admin.activity.exportLanguage")}>
              {({ id }) => (
                <Select id={id} value={exportLang} onChange={(e) => setExportLang(e.target.value as "so" | "en")}>
                  <option value="so">{t("language.so")}</option>
                  <option value="en">{t("language.en")}</option>
                </Select>
              )}
            </Field>
            <a href={apiUrl(paths.auditCsv(filters, exportLang))} className={buttonClasses("outline")} download>
              <Download className="h-4 w-4" aria-hidden />{t("admin.activity.export")}
            </a>
          </div>
        }
      />

      <FilterBar>
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => filter(setSearch)(e.target.value)} placeholder={t("admin.activity.search")} />}
        </Field>
        <Field label={t("admin.users.role")}>
          {({ id }) => (
            <Select id={id} value={role} onChange={(e) => filter(setRole)(e.target.value as Role | "")}>
              <option value="">{t("admin.users.allRoles")}</option>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.activity.action")}>
          {({ id }) => (
            <Select id={id} value={action} onChange={(e) => filter(setAction)(e.target.value)}>
              <option value="">{t("admin.activity.allActions")}</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{actionText(a)}</option>)}
            </Select>
          )}
        </Field>
        <DateRangeFilter value={range} onChange={filter(setRange)} />
      </FilterBar>

      <Card className="overflow-hidden">
        {logs.error && !logs.data ? (
          <QueryError state={logs} />
        ) : (
          <div aria-busy={logs.loading || undefined} className={logs.loading && logs.data ? "opacity-60 transition-opacity" : undefined}>
            <DataTable columns={columns} rows={logs.data?.items ?? []} rowKey={(e) => e.id} loading={!logs.data} emptyTitle={t("admin.activity.empty")} caption={t("admin.activity.title")} />
          </div>
        )}
        {logs.data && logs.data.total > 0 && (
          <div className="border-t border-border px-5 py-4">
            <Pagination page={logs.data.page} pageSize={logs.data.pageSize} total={logs.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </>
  );
}
