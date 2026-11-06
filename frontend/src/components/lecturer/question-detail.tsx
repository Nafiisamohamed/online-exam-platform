"use client";

/**
 * One question (GET /api/questions/:id): the current version with its answer
 * key, the version history (old versions open from
 * GET /api/questions/:id/versions/:versionId), edit, and archive / restore.
 */
import { Archive, ArchiveRestore, PencilLine } from "lucide-react";
import { use, useState } from "react";
import { QueryState } from "@/components/admin/query-state";
import { FormError } from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { lecturerPaths, setQuestionArchived } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { QuestionDetail as Detail, QuestionVersion } from "@/types/lecturer";
import { QuestionEditor } from "./question-editor";
import { QuestionView } from "./question-view";

const viewable = (v: QuestionVersion) => ({ ...v, topic: v.topic.name, options: [...v.options].sort((a, b) => a.position - b.position) });

function VersionModal({ questionId, versionId, onClose }: { questionId: string; versionId: string; onClose: () => void }) {
  const { t } = useI18n();
  const version = useApi<{ version: QuestionVersion }>(lecturerPaths.questionVersion(questionId, versionId));
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={version.data ? t("lecturer.questions.versionTitle", { number: version.data.version.versionNumber }) : t("common.loading")} closeLabel={t("common.close")} size="lg">
      <QueryState state={version} skeleton="h-40 w-full">{({ version: v }) => <QuestionView q={viewable(v)} />}</QueryState>
    </Modal>
  );
}

function DetailView({ question }: { question: Detail }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const v = question.current;

  const toggleArchive = async () => {
    setBusy(true);
    setError(null);
    try {
      await setQuestionArchived(question.id, question.courseId, !question.isArchived);
      toast(question.isArchived ? t("lecturer.questions.restoredToast") : t("lecturer.questions.archivedToast"));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.questionBank"), href: "/lecturer/questions" }, { label: t("lecturer.questions.detailTitle") }]} />}
        title={t("lecturer.questions.detailTitle")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {v && <Badge tone="sky">{t("lecturer.common.version", { number: v.versionNumber })}</Badge>}
            {v?.isLocked && <Badge tone="warning">{t("lecturer.common.locked")}</Badge>}
            {question.isArchived && <Badge tone="neutral">{t("lecturer.questions.archived")}</Badge>}
          </span>
        }
        actions={
          <>
            {!question.isArchived && <Button variant="secondary" leftIcon={<PencilLine className="h-4 w-4" />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>}
            <Button variant="outline" leftIcon={question.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} onClick={() => setConfirm(true)}>
              {question.isArchived ? t("lecturer.questions.restore") : t("lecturer.questions.archive")}
            </Button>
          </>
        }
      />
      {error ? <div className="mb-4"><FormError error={error} /></div> : null}
      {question.isArchived && <Alert tone="info" className="mb-4">{t("errors.QUESTION_ARCHIVED")}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Card>
          <CardHeader title={t("lecturer.questions.answerKey")} />
          <CardContent>{v ? <QuestionView q={viewable(v)} /> : "—"}</CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader title={t("lecturer.questions.versions")} />
          <CardContent className="pt-3">
            <ul className="divide-y divide-border">
              {[...question.versions].reverse().map((ver) => (
                <li key={ver.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-foreground">{t("lecturer.common.version", { number: ver.versionNumber })}</span>
                    <span className="block text-xs text-muted">{formatDate(ver.createdAt, locale)}{ver.isLocked ? ` · ${t("lecturer.common.locked")}` : ""}</span>
                  </span>
                  {ver.id === v?.id ? <Badge tone="sky">{t("lecturer.questions.current")}</Badge> : <Button variant="ghost" size="sm" onClick={() => setViewing(ver.id)}>{t("lecturer.questions.viewVersion")}</Button>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {editing && <QuestionEditor courseId={question.courseId} question={question} open onOpenChange={setEditing} />}
      {viewing && <VersionModal questionId={question.id} versionId={viewing} onClose={() => setViewing(null)} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={question.isArchived ? t("lecturer.questions.restoreTitle") : t("lecturer.questions.archiveTitle")}
        description={question.isArchived ? t("lecturer.questions.restoreBody") : t("lecturer.questions.archiveBody")}
        confirmLabel={question.isArchived ? t("lecturer.questions.restore") : t("lecturer.questions.archive")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={toggleArchive}
      />
    </>
  );
}

export function QuestionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const question = useApi<{ question: Detail }>(lecturerPaths.question(id));
  return <QueryState state={question} skeleton="h-72 w-full">{({ question: q }) => <DetailView question={q} />}</QueryState>;
}
