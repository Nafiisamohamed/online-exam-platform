"use client";

/** User management: GET /api/users with role, status and search filters, paged on the server. */
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActiveBadge, FilterBar, RoleBadge } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { CreateUserModal } from "@/components/admin/user-forms";
import { PageHeader } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { useDebounced } from "@/hooks/use-debounced";
import { paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { AdminUser, Paged } from "@/types/admin";
import { ROLES, type Role } from "@/types/account";

const PAGE_SIZE = 20;

export default function UsersPage() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [status, setStatus] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const term = useDebounced(search.trim());

  const users = useApi<Paged<AdminUser>>(
    paths.users({ role: role || undefined, search: term || undefined, active: status === "" ? undefined : status === "true", page, pageSize: PAGE_SIZE }),
    { keepPrevious: true },
  );

  // Any filter change starts again at page 1.
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<AdminUser>[] = [
    {
      key: "name",
      header: t("admin.users.name"),
      primary: true,
      cell: (u) => (
        <Link href={`/admin/users/${u.id}`} className="group flex min-w-0 items-center gap-3">
          <Avatar name={u.fullName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground group-hover:text-accent-strong">{u.fullName}</span>
            {u.mustChangePassword && <Badge tone="warning" className="mt-0.5">{t("admin.users.mustChange")}</Badge>}
          </span>
        </Link>
      ),
    },
    { key: "login", header: t("admin.users.login"), cell: (u) => <span className="break-all">{u.studentNumber ?? u.email ?? "—"}</span> },
    { key: "role", header: t("admin.users.role"), cell: (u) => <RoleBadge role={u.role} /> },
    { key: "phone", header: t("admin.users.phone"), cell: (u) => <span className="whitespace-nowrap tabular-nums">{u.phone}</span>, className: "hidden lg:table-cell" },
    { key: "status", header: t("admin.status"), cell: (u) => <ActiveBadge active={u.isActive} /> },
    { key: "created", header: t("admin.created"), cell: (u) => <span className="whitespace-nowrap text-muted">{formatDate(u.createdAt, locale)}</span>, className: "hidden xl:table-cell" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.users") }]} />}
        title={t("admin.users.title")}
        description={t("admin.users.subtitle")}
        actions={<Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>{t("admin.users.add")}</Button>}
      />

      <FilterBar>
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => filter(setSearch)(e.target.value)} placeholder={t("admin.users.search")} />}
        </Field>
        <Field label={t("admin.users.role")}>
          {({ id }) => (
            <Select id={id} value={role} onChange={(e) => filter(setRole)(e.target.value as Role | "")}>
              <option value="">{t("admin.users.allRoles")}</option>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("admin.status")}>
          {({ id }) => (
            <Select id={id} value={status} onChange={(e) => filter(setStatus)(e.target.value as "" | "true" | "false")}>
              <option value="">{t("admin.allStatuses")}</option>
              <option value="true">{t("admin.active")}</option>
              <option value="false">{t("admin.inactive")}</option>
            </Select>
          )}
        </Field>
      </FilterBar>

      <Card className="overflow-hidden">
        {users.error && !users.data ? (
          <QueryError state={users} />
        ) : (
          <div aria-busy={users.loading || undefined} className={users.loading && users.data ? "opacity-60 transition-opacity" : undefined}>
            <DataTable columns={columns} rows={users.data?.items ?? []} rowKey={(u) => u.id} loading={!users.data} emptyTitle={t("table.noRows")} caption={t("admin.users.title")} />
          </div>
        )}
        {users.data && users.data.total > 0 && (
          <div className="border-t border-border px-5 py-4">
            <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>

      {creating && <CreateUserModal open={creating} onOpenChange={setCreating} />}
    </>
  );
}
