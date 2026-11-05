"use client";

/**
 * One account (GET /api/users/:id) with the actions the API offers:
 * edit (PATCH), deactivate / reactivate (PATCH isActive) and reset password
 * (POST …/reset-password, the new temporary password is shown once).
 * Lecturers also list the courses they teach (from GET /api/courses).
 */
import { KeyRound, PencilLine, Power, PowerOff } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { paths, resetPassword, updateUser } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatDate } from "@/lib/format";
import { errorText } from "@/lib/i18n/error-text";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import type { AdminUser, Course } from "@/types/admin";
import { ActiveBadge, DetailList, RoleBadge, TemporaryPassword } from "./admin-ui";
import { QueryState } from "./query-state";
import { EditUserModal } from "./user-forms";

function TaughtCourses({ lecturerId }: { lecturerId: string }) {
  const { t } = useI18n();
  const courses = useApi<{ items: Course[] }>(paths.courses());
  return (
    <Card>
      <CardHeader title={t("nav.courses")} />
      <CardContent>
        <QueryState state={courses} skeleton="h-24 w-full">
          {({ items }) => {
            const mine = items.filter((c) => c.lecturerId === lecturerId);
            return mine.length === 0 ? (
              <p className="text-sm text-muted">{t("states.emptyTitle")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {mine.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/admin/courses/${c.id}`} className="min-w-0 font-medium text-foreground hover:text-accent-strong">
                      <span className="font-semibold">{c.code}</span> · {c.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{c.semester}</span>
                  </li>
                ))}
              </ul>
            );
          }}
        </QueryState>
      </CardContent>
    </Card>
  );
}

function UserView({ user }: { user: AdminUser }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { profile } = useSession();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"active" | "reset" | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const isSelf = user.id === profile.id;

  const run = async () => {
    setBusy(true);
    setActionError(null);
    try {
      if (confirm === "active") {
        await updateUser(user.id, { isActive: !user.isActive });
        toast(t("admin.saved"));
      } else if (confirm === "reset") {
        setTempPassword(await resetPassword(user.id));
      }
      setConfirm(null);
    } catch (err) {
      setActionError(err);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.users"), href: "/admin/users" }, { label: user.fullName }]} />}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={user.fullName} size="md" />
            <span className="min-w-0 break-words">{user.fullName}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <RoleBadge role={user.role} />
            <ActiveBadge active={user.isActive} />
          </span>
        }
        actions={
          <>
            <Button variant="secondary" leftIcon={<PencilLine className="h-4 w-4" />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>
            <Button variant="outline" leftIcon={<KeyRound className="h-4 w-4" />} onClick={() => setConfirm("reset")}>{t("admin.users.resetPassword")}</Button>
            {user.isActive ? (
              <Button variant="danger" leftIcon={<PowerOff className="h-4 w-4" />} onClick={() => setConfirm("active")} disabled={isSelf} title={isSelf ? t("admin.users.selfNote") : undefined}>
                {t("admin.users.deactivate")}
              </Button>
            ) : (
              <Button leftIcon={<Power className="h-4 w-4" />} onClick={() => setConfirm("active")}>{t("admin.users.activate")}</Button>
            )}
          </>
        }
      />

      {actionError ? <Alert tone="danger" className="mb-4" title={errorText(t, actionError)} /> : null}
      {isSelf && <Alert tone="info" className="mb-4">{t("admin.users.selfNote")}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title={t("admin.users.accountSection")} />
          <CardContent className="pt-2">
            <DetailList
              items={[
                { label: t("admin.users.role"), value: t(`roles.${user.role}`) },
                user.role === "STUDENT"
                  ? { label: t("admin.users.studentNumber"), value: user.studentNumber ?? "—" }
                  : { label: t("admin.users.email"), value: user.email ?? "—" },
                { label: t("admin.users.phone"), value: user.phone },
                { label: t("admin.users.preferredLanguage"), value: t(`language.${user.preferredLanguage}`) },
                { label: t("admin.created"), value: formatDate(user.createdAt, locale) },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("admin.users.signInSection")} />
          <CardContent className="space-y-4 pt-2">
            <DetailList
              items={[
                { label: t("admin.status"), value: <ActiveBadge active={user.isActive} /> },
                { label: t("admin.users.passwordStatus"), value: user.mustChangePassword ? t("admin.users.passwordTemporary") : t("admin.users.passwordSet") },
              ]}
            />
            <p className="text-xs text-muted">{t("admin.users.passwordsHidden")}</p>
          </CardContent>
        </Card>
        {user.role === "LECTURER" && <TaughtCourses lecturerId={user.id} />}
      </div>

      {editing && <EditUserModal user={user} open={editing} onOpenChange={setEditing} />}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm === "reset"
            ? t("admin.users.resetTitle", { name: user.fullName })
            : user.isActive
              ? t("admin.users.deactivateTitle", { name: user.fullName })
              : t("admin.users.activateTitle", { name: user.fullName })
        }
        description={confirm === "reset" ? t("admin.users.resetBody") : user.isActive ? t("admin.users.deactivateBody") : t("admin.users.activateBody")}
        confirmLabel={confirm === "reset" ? t("admin.users.resetPassword") : user.isActive ? t("admin.users.deactivate") : t("admin.users.activate")}
        cancelLabel={t("common.cancel")}
        destructive={confirm === "active" && user.isActive}
        loading={busy}
        onConfirm={run}
      />

      <Modal
        open={tempPassword !== null}
        onOpenChange={(o) => !o && setTempPassword(null)}
        title={t("admin.users.tempTitle")}
        closeLabel={t("common.close")}
        footer={<Button onClick={() => setTempPassword(null)}>{t("admin.users.done")}</Button>}
      >
        {tempPassword && <TemporaryPassword name={user.fullName} login={user.studentNumber ?? user.email} password={tempPassword} />}
      </Modal>
    </>
  );
}

export function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useApi<{ user: AdminUser }>(paths.user(id));
  return (
    <QueryState state={user} skeleton="h-72 w-full">
      {({ user: u }) => <UserView user={u} />}
    </QueryState>
  );
}
