"use client";

/**
 * Question CSV import in the API's steps:
 *  1. POST /api/courses/:courseId/question-imports checks every row with the
 *     same rules as the editor and finds duplicates (of the bank or of an
 *     earlier row); nothing is saved;
 *  2. the preview shows each row's status and translated problems;
 *  3. POST /api/imports/:id/confirm re-checks and saves only the valid rows.
 */
import { AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field } from "@/components/ui/form";
import { ConfirmDialog, Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { StatCard } from "@/components/ui/stat-card";
import { apiUrl } from "@/lib/api/client";
import { confirmQuestionImport, lecturerPaths, previewQuestionImport } from "@/lib/api/lecturer";
import { questionErrorText } from "@/lib/i18n/error-text";
import { useI18n } from "@/lib/i18n/i18n";
import { QUESTION_TYPES, type QuestionImportPreview, type QuestionImportResult, type QuestionImportRow, type QuestionType } from "@/types/lecturer";

const statusTone = { VALID: "success", INVALID: "danger", DUPLICATE: "warning" } as const;

function Rows({ rows }: { rows: QuestionImportRow[] }) {
  const { t } = useI18n();
  // A CSV row may carry an unknown type; it is then shown as written.
  const typeLabel = (type: string | undefined) => (type && (QUESTION_TYPES as readonly string[]).includes(type) ? t(`admin.exams.questionTypes.${type as QuestionType}`) : type);
  const columns: Column<QuestionImportRow>[] = [
    { key: "row", header: t("lecturer.questions.row"), cell: (r) => <span className="tabular-nums text-muted">{r.row}</span> },
    {
      key: "question",
      header: t("lecturer.questions.question"),
      primary: true,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="line-clamp-2 font-medium text-foreground">{r.question?.text || "—"}</span>
          <span className="text-xs text-muted">
            {[typeLabel(r.question?.type), r.question?.topic].filter(Boolean).join(" · ")}
          </span>
        </span>
      ),
    },
    { key: "status", header: t("admin.status"), cell: (r) => <Badge tone={statusTone[r.status]} dot>{t(`lecturer.questions.status${r.status}`)}</Badge> },
    {
      key: "problems",
      header: t("lecturer.questions.problems"),
      cell: (r) =>
        r.errors.length === 0 ? (
          <span className="text-xs text-subtle">—</span>
        ) : (
          <ul className="space-y-1 text-left text-xs text-danger">{r.errors.map((e, i) => <li key={i}>{questionErrorText(t, e)}</li>)}</ul>
        ),
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.row)} emptyTitle={t("table.noRows")} caption={t("lecturer.questions.tabImport")} />;
}

export function QuestionImport({ courseId }: { courseId: string }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<QuestionImportPreview | null>(null);
  const [result, setResult] = useState<QuestionImportResult | null>(null);
  const [filter, setFilter] = useState<"all" | "problems">("all");
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => (preview ? (filter === "problems" ? preview.rows.filter((r) => r.status !== "VALID") : preview.rows) : []), [preview, filter]);

  const startOver = () => {
    setFile(null); setPreview(null); setResult(null); setError(null); setFilter("all");
    if (input.current) input.current.value = "";
  };

  const check = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await previewQuestionImport(courseId, file);
      setPreview(res);
      setFilter(res.batch.validRows < res.batch.totalRows ? "problems" : "all");
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
      setResult(await confirmQuestionImport(preview.batch.id, courseId));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5">
        {error ? <FormError error={error} /> : null}

        {!preview && (
          <form onSubmit={check} className="space-y-5" noValidate>
            <p className="text-sm text-muted">{t("lecturer.questions.importIntro")}</p>
            <Field label={t("lecturer.questions.file")} hint={t("lecturer.questions.fileHint")} required>
              {({ id, describedBy }) => (
                <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface-muted px-4 py-3 text-sm transition-colors hover:border-accent hover:bg-accent-soft focus-within:ring-4 focus-within:ring-ring">
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-accent-strong" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-text">{file ? file.name : t("lecturer.questions.noFile")}</span>
                  <span className={buttonClasses("secondary", "sm")}>{t("lecturer.questions.chooseFile")}</span>
                  <input ref={input} id={id} aria-describedby={describedBy} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
              )}
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <a href={apiUrl(lecturerPaths.questionTemplate)} download className={buttonClasses("outline")}>
                <Download className="h-4 w-4" aria-hidden /> {t("lecturer.questions.template")}
              </a>
              <Button type="submit" leftIcon={<Upload className="h-4 w-4" />} loading={busy} disabled={!file}>{t("lecturer.questions.check")}</Button>
            </div>
          </form>
        )}

        {preview && !result && (
          <>
            <h3 className="text-base font-semibold text-foreground">{t("lecturer.questions.previewTitle", { file: preview.batch.filename })}</h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
              <StatCard label={t("lecturer.questions.totalRows")} value={preview.batch.totalRows} icon={FileSpreadsheet} />
              <StatCard label={t("lecturer.questions.validRows")} value={preview.batch.validRows} icon={CheckCircle2} />
              <StatCard label={t("lecturer.questions.invalidRows")} value={preview.batch.invalidRows} icon={AlertTriangle} />
              <StatCard label={t("lecturer.questions.duplicateRows")} value={preview.batch.duplicateRows} icon={Copy} />
            </div>
            {preview.batch.validRows === 0 && <Alert tone="warning">{t("lecturer.questions.nothingValid")}</Alert>}
            <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "problems")}>
              <TabsList>
                <TabsTrigger value="all">{t("lecturer.questions.showAll")} ({preview.rows.length})</TabsTrigger>
                <TabsTrigger value="problems">{t("lecturer.questions.showProblems")} ({preview.batch.invalidRows + preview.batch.duplicateRows})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="overflow-hidden rounded-xl border border-border"><Rows rows={shown} /></div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="outline" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={startOver}>{t("common.back")}</Button>
              <Button onClick={() => setConfirming(true)} disabled={preview.batch.validRows === 0}>{t("lecturer.questions.save", { count: preview.batch.validRows })}</Button>
            </div>
            <ConfirmDialog
              open={confirming}
              onOpenChange={setConfirming}
              title={t("lecturer.questions.confirmTitle")}
              description={t("lecturer.questions.confirmBody", { count: preview.batch.validRows })}
              confirmLabel={t("common.confirm")}
              cancelLabel={t("common.cancel")}
              loading={busy}
              onConfirm={save}
            />
          </>
        )}

        {result && (
          <>
            <Alert tone="success" title={t("lecturer.questions.savedTitle")} />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
              <StatCard emphasis label={t("lecturer.questions.savedRows")} value={result.savedRows} icon={CheckCircle2} />
              <StatCard label={t("lecturer.questions.totalRows")} value={result.totalRows} icon={FileSpreadsheet} />
              <StatCard label={t("lecturer.questions.invalidRows")} value={result.invalidRows} icon={AlertTriangle} />
              <StatCard label={t("lecturer.questions.duplicateRows")} value={result.duplicateRows} icon={Copy} />
            </div>
            <Button variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={startOver}>{t("lecturer.questions.another")}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
