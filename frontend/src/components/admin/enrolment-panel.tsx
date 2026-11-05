"use client";

/**
 * The students of one course (GET /api/courses/:id/enrolments), with enrol
 * (POST …/enrolments { studentNumber }) and drop (POST …/drop).
 * The server checks exam clashes; if enrolling would give the student two
 * overlapping exams, the refusal (409 ENROLMENT_SCHEDULE_CONFLICT) is shown
 * with the clashing exams. Nothing here bypasses that check.
 */
import { UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { checks } from "@/lib/admin/validation";
import { dropStudent, enrolStudent, paths } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatDate } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/i18n/i18n";
import type { Course, Enrolment, EnrolmentStatus } from "@/types/admin";
import { EnrolmentBadge, FormError } from "./admin-ui";
import { QueryError } from "./query-state";

function EnrolModal({ course, open, onOpenChange }: { course: Course; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [fieldError, setFieldError] = useState<MessageKey | null>(null);
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = checks.studentNumber(number);
    setFieldError(problem);
    if (problem) return;
    setBusy(true);
    setServerError(null);
    try {
      await enrolStudent(course.id, number.trim());
      toast(t("admin.enrolment.enrolledToast"));
      onOpenChange(false);
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("admin.enrolment.enrolTitle", { course: course.code })}
      description={t("admin.enrolment.enrolHint")}
      closeLabel={t("common.cancel")}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="enrol-form" loading={busy}>{t("admin.enrolment.enrol")}</Button>
        </>
      }
    >
      <form id="enrol-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={serverError} />
        <Field label={t("admin.enrolment.studentNumber")} error={fieldError && t(fieldError)} required>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} maxLength={30} autoComplete="off" autoFocus />}
        </Field>
      </form>
    </Modal>
  );
}

export function EnrolmentPanel({ course }: { course: Course }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<EnrolmentStatus | "">("");
  const [search, setSearch] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [dropping, setDropping] = useState<Enrolment | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropError, setDropError] = useState<unknown>(null);
  const enrolments = useApi<{ items: Enrolment[] }>(paths.enrolments(course.id, status || undefined), { keepPrevious: true });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = enrolments.data?.items ?? [];
    return q ? all.filter((e) => e.student.fullName.toLowerCase().includes(q) || (e.student.studentNumber ?? "").toLowerCase().includes(q)) : all;
  }, [enrolments.data, search]);

  const drop = async () => {
    if (!dropping) return;
    setBusy(true);
    setDropError(null);
    try {
      await dropStudent(course.id, dropping.student.id);
      toast(t("admin.enrolment.droppedToast"));
    } catch (err) {
      setDropError(err);
    } finally {
      setBusy(false);
      setDropping(null);
    }
  };

  const columns: Column<Enrolment>[] = [
    {
      key: "student",
      header: t("admin.enrolment.student"),
      primary: true,
      cell: (e) => (
        <Link href={`/admin/users/${e.student.id}`} className="group block min-w-0">
          <span className="block font-semibold text-foreground group-hover:text-accent-strong">{e.student.fullName}</span>
          <span className="block text-xs text-muted">{e.student.studentNumber}</span>
        </Link>
      ),
    },
    { key: "phone", header: t("admin.enrolment.phone"), cell: (e) => <span className="whitespace-nowrap tabular-nums">{e.student.phone}</span>, className: "hidden lg:table-cell" },
    { key: "status", header: t("admin.status"), cell: (e) => <EnrolmentBadge status={e.status} /> },
    { key: "enrolled", header: t("admin.enrolment.enrolledAt"), cell: (e) => <span className="whitespace-nowrap text-muted">{formatDate(e.enrolledAt, locale)}</span> },
    { key: "dropped", header: t("admin.enrolment.droppedAt"), cell: (e) => <span className="whitespace-nowrap text-muted">{e.droppedAt ? formatDate(e.droppedAt, locale) : "—"}</span>, className: "hidden xl:table-cell" },
    {
      key: "actions",
      header: <span className="sr-only">{t("table.actions")}</span>,
      align: "right",
      cell: (e) =>
        e.status === "ACTIVE" ? (
          <Button variant="ghost" size="sm" leftIcon={<UserMinus className="h-3.5 w-3.5" />} onClick={() => setDropping(e)}>{t("admin.enrolment.drop")}</Button>
        ) : (
          <span className="text-xs text-subtle">—</span>
        ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end">
        <Field label={t("common.search")} className="flex-1">
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.enrolment.search")} />}
        </Field>
        <Field label={t("admin.status")} className="sm:w-44">
          {({ id }) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as EnrolmentStatus | "")}>
              <option value="">{t("admin.allStatuses")}</option>
              <option value="ACTIVE">{t("admin.enrolment.statusACTIVE")}</option>
              <option value="DROPPED">{t("admin.enrolment.statusDROPPED")}</option>
            </Select>
          )}
        </Field>
        <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setEnrolling(true)}>{t("admin.enrolment.enrol")}</Button>
      </div>
      {dropError ? <div className="px-5 pt-4"><FormError error={dropError} /></div> : null}
      {enrolments.error && !enrolments.data ? (
        <QueryError state={enrolments} />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} loading={!enrolments.data} emptyTitle={t("table.noRows")} caption={t("admin.courses.tabStudents")} />
      )}
      {enrolling && <EnrolModal course={course} open onOpenChange={setEnrolling} />}
      <ConfirmDialog
        open={!!dropping}
        onOpenChange={(o) => !o && setDropping(null)}
        title={dropping ? t("admin.enrolment.dropTitle", { name: dropping.student.fullName, course: course.code }) : ""}
        description={t("admin.enrolment.dropBody")}
        confirmLabel={t("admin.enrolment.drop")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={busy}
        onConfirm={drop}
      />
    </div>
  );
}
