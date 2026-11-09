"use client";

/**
 * Enrolment CSV import, in the API's three steps:
 *  1. upload  – POST /api/imports/enrolments (file + semester) validates every
 *               row and stores a preview; nothing is saved yet;
 *  2. review  – the rows with their status and translated problems (missing
 *               fields, unknown courses, duplicates in the file, name
 *               mismatches and exam clashes, all found by the server);
 *  3. confirm – POST /api/imports/:id/confirm saves only the valid rows and
 *               returns the new students' temporary passwords, shown once.
 */
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload, UserPlus } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/form";
import { ConfirmDialog, Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { StatCard } from "@/components/ui/stat-card";
import { checks } from "@/lib/admin/validation";
import { confirmImport, paths, previewEnrolmentImport } from "@/lib/api/admin";
import { apiUrl } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { importErrorText } from "@/lib/i18n/error-text";
import { useI18n, type MessageKey } from "@/lib/i18n/i18n";
import type { EnrolmentImportRow, ImportConfirmResult, ImportPreview } from "@/types/admin";
import { CopyButton, FormError } from "./admin-ui";

type Step = "upload" | "review" | "saved";

function Steps({ step }: { step: Step }) {
  const { t } = useI18n();
  const steps: { key: Step; label: MessageKey }[] = [
    { key: "upload", label: "admin.enrolment.stepUpload" },
    { key: "review", label: "admin.enrolment.stepReview" },
    { key: "saved", label: "admin.enrolment.stepSaved" },
  ];
  const current = steps.findIndex((s) => s.key === step);
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", i < current ? "bg-success-soft text-success" : i === current ? "bg-primary text-primary-foreground" : "bg-surface-sunken text-subtle")}>
            {i < current ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : i + 1}
          </span>
          <span className={i === current ? "font-semibold text-foreground" : "text-muted"}>{t(s.label)}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function PreviewRows({ rows }: { rows: EnrolmentImportRow[] }) {
  const { t } = useI18n();
  const columns: Column<EnrolmentImportRow>[] = [
    { key: "row", header: t("admin.enrolment.row"), cell: (r) => <span className="tabular-nums text-muted">{r.row}</span> },
    {
      key: "student",
      header: t("admin.enrolment.student"),
      primary: true,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-foreground">{r.data.fullName || "—"}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {r.data.studentNumber || t("admin.enrolment.numberOnSave")}
            <Badge tone={r.data.existingStudent ? "neutral" : "sky"}>{r.data.existingStudent ? t("admin.enrolment.existingStudent") : t("admin.enrolment.newStudent")}</Badge>
          </span>
        </span>
      ),
    },
    { key: "phone", header: t("admin.enrolment.phone"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.data.phone || "—"}</span>, className: "hidden lg:table-cell" },
    {
      key: "courses",
      header: t("admin.enrolment.courses"),
      cell: (r) => (
        <span className="block">
          {r.data.courseCodes.join(", ") || "—"}
          {r.data.alreadyEnrolled.length > 0 && <span className="block text-xs text-muted">{t("admin.enrolment.alreadyIn", { codes: r.data.alreadyEnrolled.join(", ") })}</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.enrolment.problems"),
      cell: (r) =>
        r.status === "VALID" ? (
          <Badge tone="success" dot>{t("admin.enrolment.ready")}</Badge>
        ) : (
          <ul className="space-y-1 text-left text-xs text-danger">
            {r.errors.map((e, i) => <li key={i}>{importErrorText(t, e)}</li>)}
          </ul>
        ),
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.row)} emptyTitle={t("table.noRows")} caption={t("admin.enrolment.stepReview")} />;
}

export function EnrolmentImport({ defaultSemester }: { defaultSemester: string }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("upload");
  const [semester, setSemester] = useState(defaultSemester);
  const [file, setFile] = useState<File | null>(null);
  const [semesterError, setSemesterError] = useState<MessageKey | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportConfirmResult | null>(null);
  const [filter, setFilter] = useState<"all" | "invalid">("all");
  const [confirming, setConfirming] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const shownRows = useMemo(() => (preview ? (filter === "invalid" ? preview.rows.filter((r) => r.status !== "VALID") : preview.rows) : []), [preview, filter]);

  const startOver = () => {
    setStep("upload"); setFile(null); setPreview(null); setResult(null); setError(null); setFilter("all");
    if (fileInput.current) fileInput.current.value = "";
  };

  const check = async (e: FormEvent) => {
    e.preventDefault();
    const problem = checks.semester(semester);
    setSemesterError(problem);
    if (problem || !file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await previewEnrolmentImport(file, semester.trim());
      setPreview(res);
      setFilter(res.batch.invalidRows > 0 ? "invalid" : "all");
      setStep("review");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await confirmImport(preview.batch.id));
      setStep("saved");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Steps step={step} />
        {error ? <div className="mb-4"><FormError error={error} /></div> : null}

        {step === "upload" && (
          <form onSubmit={check} className="space-y-5" noValidate>
            <p className="text-sm text-muted">{t("admin.enrolment.importIntro")}</p>
            <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <Field label={t("admin.enrolment.semester")} hint={t("admin.enrolment.semesterHint")} error={semesterError && t(semesterError)} required>
                {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="2026-Fall" />}
              </Field>
              <Field label={t("admin.enrolment.file")} hint={t("admin.enrolment.fileHint")} required>
                {({ id, describedBy }) => (
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface-muted px-4 py-3 text-sm transition-colors hover:border-accent hover:bg-accent-soft focus-within:ring-4 focus-within:ring-ring"
                  >
                    <FileSpreadsheet className="h-5 w-5 shrink-0 text-accent-strong" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-text">{file ? file.name : t("admin.enrolment.noFile")}</span>
                    <span className={buttonClasses("secondary", "sm")}>{t("admin.enrolment.chooseFile")}</span>
                    <input ref={fileInput} id={id} aria-describedby={describedBy} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  </label>
                )}
              </Field>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <a href={apiUrl(paths.enrolmentTemplate)} download className={buttonClasses("outline")}>
                <Download className="h-4 w-4" aria-hidden /> {t("admin.enrolment.template")}
              </a>
              <Button type="submit" leftIcon={<Upload className="h-4 w-4" />} loading={busy} disabled={!file}>{t("admin.enrolment.check")}</Button>
            </div>
          </form>
        )}

        {step === "review" && preview && (
          <div className="space-y-5">
            <h3 className="text-base font-semibold text-foreground">{t("admin.enrolment.previewTitle", { file: preview.batch.filename })}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label={t("admin.enrolment.totalRows")} value={preview.batch.totalRows} icon={FileSpreadsheet} />
              <StatCard label={t("admin.enrolment.validRows")} value={preview.batch.validRows} icon={CheckCircle2} />
              <StatCard label={t("admin.enrolment.invalidRows")} value={preview.batch.invalidRows} icon={AlertTriangle} />
            </div>
            {preview.batch.validRows === 0 && <Alert tone="warning">{t("admin.enrolment.nothingValid")}</Alert>}
            <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "invalid")}>
              <TabsList>
                <TabsTrigger value="all">{t("admin.enrolment.showAll")} ({preview.rows.length})</TabsTrigger>
                <TabsTrigger value="invalid">{t("admin.enrolment.showInvalid")} ({preview.batch.invalidRows})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="overflow-hidden rounded-xl border border-border">
              <PreviewRows rows={shownRows} />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="outline" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={startOver}>{t("common.back")}</Button>
              <Button onClick={() => setConfirming(true)} disabled={preview.batch.validRows === 0}>{t("admin.enrolment.save", { count: preview.batch.validRows })}</Button>
            </div>
            <ConfirmDialog
              open={confirming}
              onOpenChange={setConfirming}
              title={t("admin.enrolment.confirmTitle")}
              description={t("admin.enrolment.confirmBody", { count: preview.batch.validRows })}
              confirmLabel={t("common.confirm")}
              cancelLabel={t("common.cancel")}
              loading={busy}
              onConfirm={save}
            />
          </div>
        )}

        {step === "saved" && result && (
          <div className="space-y-5">
            <Alert tone="success" title={t("admin.enrolment.savedTitle")} />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard emphasis label={t("admin.enrolment.savedRows")} value={result.savedRows} icon={CheckCircle2} />
              <StatCard label={t("admin.enrolment.newStudents")} value={result.newStudents} icon={UserPlus} />
              <StatCard label={t("admin.enrolment.enrolledCount")} value={result.enrolled} icon={FileSpreadsheet} />
              <StatCard label={t("admin.enrolment.reactivated")} value={result.reactivated} icon={RotateCcw} />
            </div>
            {result.temporaryPasswords.length > 0 && (
              <Card className="overflow-hidden">
                <CardHeader title={t("admin.enrolment.passwordsTitle")} />
                <CardContent className="space-y-4">
                  <Alert tone="warning">{t("admin.enrolment.passwordsHint")}</Alert>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {result.temporaryPasswords.map((p) => (
                      <li key={p.studentNumber} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0">
                          <span className="block font-semibold text-foreground">{p.fullName}</span>
                          <span className="block text-xs text-muted">{p.studentNumber}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-mono font-semibold tracking-wider text-foreground" aria-label={t("admin.enrolment.temporaryPassword")}>{p.temporaryPassword}</span>
                          <CopyButton value={p.temporaryPassword} label={`${t("admin.copy")} ${p.studentNumber}`} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            <Button variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={startOver}>{t("admin.enrolment.another")}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
