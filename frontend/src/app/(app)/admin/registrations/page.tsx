"use client";

/**
 * Student registration (registrar): which faculty and semester (1-8) each student is in for an
 * academic year (GET/POST /api/registrations), and enrolling a whole group (year + faculty +
 * semester) in the courses offered to it (POST /api/registrations/enrol-group). Course
 * enrolment rules, including the exam clash check, are applied by the server.
 */
import { UserPlus, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FilterBar, FormError } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useDebounced } from "@/hooks/use-debounced";
import { enrolGroup, paths, registerStudent } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import { SEMESTERS, type AcademicYear, type Faculty, type GroupEnrolResult, type Paged, type Registration } from "@/types/admin";

const PAGE_SIZE = 25;

function RegisterModal({ years, faculties, initial, onClose }: { years: AcademicYear[]; faculties: Faculty[]; initial: { academicYearId: string; facultyId: string; semesterNumber: string }; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [studentNumber, setStudentNumber] = useState("");
  const [academicYearId, setAcademicYearId] = useState(initial.academicYearId);
  const [facultyId, setFacultyId] = useState(initial.facultyId);
  const [semesterNumber, setSemesterNumber] = useState(initial.semesterNumber);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await registerStudent({ studentNumber: studentNumber.trim(), academicYearId, facultyId, semesterNumber: Number(semesterNumber) });
      toast(r.created ? t("admin.academic.registered", { name: r.registration.student.fullName }) : t("admin.academic.registrationCorrected", { name: r.registration.student.fullName }));
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("admin.academic.registerTitle")}
      description={t("admin.academic.registerHint")}
      closeLabel={t("common.cancel")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="register-form" loading={busy} disabled={!studentNumber.trim() || !academicYearId || !facultyId || !semesterNumber}>{t("admin.academic.register")}</Button>
        </>
      }
    >
      <form id="register-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />
        <Field label={t("admin.enrolment.studentNumber")} required>
          {({ id }) => <Input id={id} value={studentNumber} onChange={(e) => setStudentNumber(e.target.value.toUpperCase())} placeholder="S-2026-001" maxLength={30} autoComplete="off" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("admin.academic.year")} required>
            {({ id }) => (
              <Select id={id} value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                <option value="">{t("admin.academic.chooseYear")}</option>
                {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("admin.courses.faculty")} required>
            {({ id }) => (
              <Select id={id} value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
                <option value="">{t("admin.courses.chooseFaculty")}</option>
                {faculties.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("admin.academic.semester")} required>
            {({ id }) => (
              <Select id={id} value={semesterNumber} onChange={(e) => setSemesterNumber(e.target.value)}>
                <option value="">{t("admin.academic.chooseSemester")}</option>
                {SEMESTERS.map((n) => <option key={n} value={n}>{t("admin.academic.semesterN", { n })}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export default function RegistrationsPage() {
  const { t } = useI18n();
  const years = useApi<{ items: AcademicYear[] }>(paths.academicYears);
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const currentYear = years.data?.items.find((y) => y.isCurrent)?.id ?? "";
  const [yearChoice, setYearChoice] = useState<string | null>(null); // null = the current year
  const academicYearId = yearChoice ?? currentYear;
  const [facultyId, setFacultyId] = useState("");
  const [semesterNumber, setSemesterNumber] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [registering, setRegistering] = useState(false);
  const [groupResult, setGroupResult] = useState<GroupEnrolResult | null>(null);
  const [groupError, setGroupError] = useState<unknown>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const term = useDebounced(search.trim());

  const regs = useApi<Paged<Registration>>(
    paths.registrations({ academicYearId: academicYearId || undefined, facultyId: facultyId || undefined, semesterNumber: semesterNumber ? Number(semesterNumber) : undefined, search: term || undefined, page, pageSize: PAGE_SIZE }),
    { keepPrevious: true },
  );
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); setGroupResult(null); setGroupError(null); };
  const groupChosen = !!academicYearId && !!facultyId && !!semesterNumber;

  const runGroup = async () => {
    setGroupBusy(true);
    setGroupError(null);
    setGroupResult(null);
    try {
      setGroupResult(await enrolGroup({ academicYearId, facultyId, semesterNumber: Number(semesterNumber) }));
    } catch (err) {
      setGroupError(err);
    } finally {
      setGroupBusy(false);
    }
  };

  const columns: Column<Registration>[] = [
    {
      key: "student",
      header: t("admin.enrolment.student"),
      primary: true,
      cell: (r) => <span className="block min-w-0"><span className="block font-semibold text-foreground">{r.student.fullName}</span><span className="block text-xs text-muted">{r.student.username}</span></span>,
    },
    { key: "faculty", header: t("admin.courses.faculty"), cell: (r) => <span title={r.faculty.name}>{r.faculty.code}</span> },
    { key: "semester", header: t("admin.academic.semester"), cell: (r) => t("admin.academic.semesterN", { n: r.semesterNumber }) },
    { key: "year", header: t("admin.academic.year"), cell: (r) => r.academicYear.name, className: "hidden sm:table-cell" },
  ];

  const noYears = years.data && years.data.items.length === 0;

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.registrations") }]} />}
        title={t("admin.academic.registrationsTitle")}
        description={t("admin.academic.registrationsSubtitle")}
        actions={<Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setRegistering(true)} disabled={!years.data || !!noYears}>{t("admin.academic.registerStudent")}</Button>}
      />
      {noYears && <Alert tone="warning" className="mb-4">{t("admin.courses.noYears")}</Alert>}
      <FilterBar>
        <Field label={t("admin.academic.year")}>
          {({ id }) => (
            <Select id={id} value={academicYearId} onChange={(e) => filter(setYearChoice)(e.target.value)}>
              <option value="">{t("admin.academic.allYears")}</option>
              {years.data?.items.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          )}
        </Field>
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
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => filter(setSearch)(e.target.value)} placeholder={t("admin.academic.searchStudent")} />}
        </Field>
      </FilterBar>

      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted">{groupChosen ? t("admin.academic.groupHint") : t("admin.academic.groupChoose")}</p>
          <Button variant="secondary" leftIcon={<UsersRound className="h-4 w-4" />} disabled={!groupChosen} loading={groupBusy} onClick={runGroup}>{t("admin.academic.enrolGroup")}</Button>
        </div>
        {groupError ? <div className="mt-3"><FormError error={groupError} /></div> : null}
        {groupResult && (
          <Alert tone={groupResult.skipped.length ? "warning" : "success"} className="mt-3">
            {t("admin.academic.groupResult", { students: groupResult.students, courses: groupResult.courses, enrolled: groupResult.enrolled + groupResult.reactivated, already: groupResult.alreadyEnrolled })}
            {groupResult.skipped.length > 0 && <span className="mt-1 block">{t("admin.academic.groupSkipped", { list: groupResult.skipped.map((s) => s.student).join(", ") })}</span>}
          </Alert>
        )}
      </Card>

      <Card className="overflow-hidden">
        {regs.error && !regs.data ? (
          <QueryError state={regs} />
        ) : (
          <div aria-busy={regs.loading || undefined} className={regs.loading && regs.data ? "opacity-60 transition-opacity" : undefined}>
            <DataTable columns={columns} rows={regs.data?.items ?? []} rowKey={(r) => r.id} loading={!regs.data} emptyTitle={t("admin.academic.noRegistrations")} caption={t("admin.academic.registrationsTitle")} />
          </div>
        )}
        {regs.data && regs.data.total > 0 && (
          <div className="border-t border-border px-5 py-4">
            <Pagination page={regs.data.page} pageSize={regs.data.pageSize} total={regs.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>
      {registering && years.data && faculties.data && (
        <RegisterModal years={years.data.items} faculties={faculties.data.items} initial={{ academicYearId, facultyId, semesterNumber }} onClose={() => setRegistering(false)} />
      )}
    </>
  );
}
