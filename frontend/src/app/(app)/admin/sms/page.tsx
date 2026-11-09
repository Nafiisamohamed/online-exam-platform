"use client";

/**
 * SMS Management (registrar). Three tabs:
 * - Send: choose roles (students, lecturers, invigilators), narrow them by faculty, academic year,
 *   semester or course, check who will receive it (POST /api/sms/recipients), write the message in
 *   Somali and English or start from a template, and send it as simulated SMS and/or in-app
 *   notification (POST /api/sms/send). {name} and {username} are filled in per person.
 * - Templates: Somali + English texts per category, switched off instead of deleted.
 * - Outbox: every simulated SMS with its status (queued, simulated sent, simulated delivered,
 *   failed) and a retry for failed ones.
 * There is no real SMS gateway: nothing leaves the system, and the page says so.
 */
import { PencilLine, Plus, RotateCcw, Send, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FilterBar, FormError } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { paths, previewRecipients, retrySms, saveSmsTemplate, sendGroupMessage } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import {
  SEMESTERS, SMS_CATEGORIES, type AcademicYear, type Course, type Faculty, type RecipientChoice, type RecipientPreview, type RecipientRole,
  type SmsCategory, type SmsMessage, type SmsOutboxPage, type SmsStatus, type SmsTemplate,
} from "@/types/admin";

const ROLES: RecipientRole[] = ["STUDENT", "LECTURER", "INVIGILATOR"];
const STATUS_TONE: Record<SmsStatus, BadgeTone> = { QUEUED: "warning", SENT: "sky", DELIVERED: "success", FAILED: "danger" };
const MAX_CHARS = 459;

/** Suggested texts for a new template, in both languages (the registrar edits them before saving). */
const STARTERS: Record<SmsCategory, { so: string; en: string }> = {
  UPCOMING_EXAM: { so: "Salaan {name}. Xusuusin: imtixaankaagu wuu soo dhow yahay. Fiiri jadwalka nidaamka.", en: "Hello {name}. Reminder: your examination is coming up. Check the timetable in the system." },
  SCHEDULE_APPROVED: { so: "Salaan {name}. Jadwalka imtixaanka waa la ansixiyay. Fiiri taariikhda iyo qolka nidaamka.", en: "Hello {name}. The examination schedule has been approved. See the date and room in the system." },
  PAYMENT_REMINDER: { so: "Salaan {name}. Xusuusin: khidmadda semestarka weli waa laga rabaa. Ku bixi nidaamka.", en: "Hello {name}. Reminder: your semester fee is still outstanding. Please pay in the system." },
  PAYMENT_CONFIRMATION: { so: "Salaan {name}. Lacag bixintaada waa la helay. Rasiidka ka eeg nidaamka.", en: "Hello {name}. Your payment has been received. See the receipt in the system." },
  RESULTS_PUBLISHED: { so: "Salaan {name}. Natiijooyinka imtixaanka waa la daabacay. Gal nidaamka si aad u aragto.", en: "Hello {name}. Examination results have been published. Log in to view them." },
  RESULTS_REVISED: { so: "Salaan {name}. Natiijadaada waa la cusbooneysiiyay. Gal nidaamka si aad u aragto.", en: "Hello {name}. Your result has been revised. Log in to view it." },
  GENERAL: { so: "Salaan {name}. ", en: "Hello {name}. " },
};

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent-strong)]" />
      {label}
    </label>
  );
}

function TextPair({ so, en, onSo, onEn }: { so: string; en: string; onSo: (v: string) => void; onEn: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t("admin.sms.textSo")} hint={t("admin.sms.chars", { n: so.length, max: MAX_CHARS })} required>
        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={so} maxLength={MAX_CHARS} onChange={(e) => onSo(e.target.value)} lang="so" />}
      </Field>
      <Field label={t("admin.sms.textEn")} hint={t("admin.sms.chars", { n: en.length, max: MAX_CHARS })} required>
        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} value={en} maxLength={MAX_CHARS} onChange={(e) => onEn(e.target.value)} lang="en" />}
      </Field>
    </div>
  );
}

function SendTab() {
  const { t } = useI18n();
  const toast = useToast();
  const years = useApi<{ items: AcademicYear[] }>(paths.academicYears);
  const faculties = useApi<{ items: Faculty[] }>(paths.faculties);
  const templates = useApi<{ items: SmsTemplate[] }>(paths.smsTemplates(true));
  const [roles, setRoles] = useState<RecipientRole[]>(["STUDENT"]);
  const [g, setG] = useState({ facultyId: "", academicYearId: "", semesterNumber: "", courseId: "" });
  const courses = useApi<{ items: Course[] }>(paths.courses({ facultyId: g.facultyId || undefined, academicYearId: g.academicYearId || undefined, semesterNumber: g.semesterNumber ? Number(g.semesterNumber) : undefined }));
  const [templateId, setTemplateId] = useState("");
  const [so, setSo] = useState("");
  const [en, setEn] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [sendNote, setSendNote] = useState(true);
  const [preview, setPreview] = useState<RecipientPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const choice: RecipientChoice = {
    roles, facultyId: g.facultyId || undefined, academicYearId: g.academicYearId || undefined,
    semesterNumber: g.semesterNumber ? Number(g.semesterNumber) : undefined, courseId: g.courseId || undefined,
  };
  const changeGroup = (key: keyof typeof g) => (value: string) => {
    setG((old) => ({ ...old, [key]: value, ...(key === "courseId" ? {} : { courseId: "" }) }));
    setPreview(null);
  };
  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.data?.items.find((x) => x.id === id);
    if (tpl) { setSo(tpl.bodySo); setEn(tpl.bodyEn); }
  };
  const run = async (kind: "preview" | "send") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "preview") setPreview(await previewRecipients(choice));
      else {
        const r = await sendGroupMessage({ ...choice, templateId: templateId || undefined, bodySo: so.trim(), bodyEn: en.trim(), sendSms, sendNotification: sendNote });
        toast(t("admin.sms.sentToast", { people: r.recipients, sms: r.sms, notes: r.notifications }));
        setConfirm(false);
        setPreview(null);
      }
    } catch (err) {
      setError(err);
      setConfirm(false);
    } finally {
      setBusy(null);
    }
  };
  const ready = !!preview && preview.total > 0 && !preview.tooMany && so.trim() && en.trim() && (sendSms || sendNote);

  return (
    <div className="space-y-6">
      <FormError error={error} />
      <Card>
        <CardHeader title={t("admin.sms.whoTitle")} description={t("admin.sms.whoHint")} />
        <CardContent className="space-y-4">
          <fieldset className="flex flex-wrap gap-5">
            <legend className="mb-2 text-sm font-medium text-foreground">{t("admin.sms.roles")}</legend>
            {ROLES.map((r) => <Check key={r} label={t(`admin.sms.role.${r}`)} checked={roles.includes(r)} onChange={(on) => { setRoles(on ? [...roles, r] : roles.filter((x) => x !== r)); setPreview(null); }} />)}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("admin.courses.faculty")}>
              {({ id }) => (
                <Select id={id} value={g.facultyId} onChange={(e) => changeGroup("facultyId")(e.target.value)}>
                  <option value="">{t("admin.faculties.allFaculties")}</option>
                  {faculties.data?.items.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t("admin.academic.year")}>
              {({ id }) => (
                <Select id={id} value={g.academicYearId} onChange={(e) => changeGroup("academicYearId")(e.target.value)}>
                  <option value="">{t("admin.academic.allYears")}</option>
                  {years.data?.items.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t("admin.academic.semester")}>
              {({ id }) => (
                <Select id={id} value={g.semesterNumber} onChange={(e) => changeGroup("semesterNumber")(e.target.value)}>
                  <option value="">{t("admin.courses.allSemesters")}</option>
                  {SEMESTERS.map((n) => <option key={n} value={n}>{t("admin.academic.semesterN", { n })}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t("admin.results.course")}>
              {({ id }) => (
                <Select id={id} value={g.courseId} onChange={(e) => changeGroup("courseId")(e.target.value)}>
                  <option value="">{t("admin.courses.allCourses")}</option>
                  {courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <p className="text-xs text-muted">{t("admin.sms.filterRules")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" leftIcon={<Users className="h-4 w-4" />} loading={busy === "preview"} disabled={roles.length === 0} onClick={() => run("preview")}>{t("admin.sms.check")}</Button>
            {preview && (
              <span className="text-sm text-foreground">
                {t("admin.sms.previewLine", { total: preview.total })}{" "}
                <span className="text-muted">({ROLES.filter((r) => preview.byRole[r]).map((r) => `${t(`admin.sms.role.${r}`)}: ${preview.byRole[r]}`).join(", ")})</span>
              </span>
            )}
          </div>
          {preview?.tooMany && <Alert tone="danger">{t("admin.sms.tooMany", { max: preview.max })}</Alert>}
          {preview && preview.withoutPhone > 0 && <Alert tone="warning">{t("admin.sms.withoutPhone", { n: preview.withoutPhone })}</Alert>}
          {preview && preview.total > 0 && (
            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium text-foreground">{t("admin.sms.showNames", { n: Math.min(preview.total, preview.sample.length) })}</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {preview.sample.map((p) => <li key={p.id} className="truncate text-muted"><span className="text-foreground">{p.fullName}</span> · {p.username}</li>)}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title={t("admin.sms.messageTitle")} description={t("admin.sms.messageHint")} />
        <CardContent className="space-y-4">
          <Field label={t("admin.sms.template")}>
            {({ id }) => (
              <Select id={id} value={templateId} onChange={(e) => pickTemplate(e.target.value)} className="sm:w-96">
                <option value="">{t("admin.sms.ownText")}</option>
                {templates.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name} · {t(`admin.sms.category.${x.category}`)}</option>)}
              </Select>
            )}
          </Field>
          <TextPair so={so} en={en} onSo={setSo} onEn={setEn} />
          <div className="flex flex-wrap gap-5">
            <Check label={t("admin.sms.viaSms")} checked={sendSms} onChange={setSendSms} />
            <Check label={t("admin.sms.viaNotification")} checked={sendNote} onChange={setSendNote} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button leftIcon={<Send className="h-4 w-4" />} disabled={!ready} onClick={() => setConfirm(true)}>{t("admin.sms.send")}</Button>
            {!preview && <span className="text-xs text-muted">{t("admin.sms.checkFirst")}</span>}
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("admin.sms.confirmTitle")}
        description={t("admin.sms.confirmBody", { total: preview?.total ?? 0 })}
        confirmLabel={t("admin.sms.send")}
        cancelLabel={t("common.cancel")}
        loading={busy === "send"}
        onConfirm={() => run("send")}
      />
    </div>
  );
}

function TemplateModal({ template, onClose }: { template?: SmsTemplate; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState<SmsCategory>(template?.category ?? "UPCOMING_EXAM");
  const [so, setSo] = useState(template?.bodySo ?? STARTERS.UPCOMING_EXAM.so);
  const [en, setEn] = useState(template?.bodyEn ?? STARTERS.UPCOMING_EXAM.en);
  const [active, setActive] = useState(template?.isActive ?? true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const ok = name.trim() && so.trim() && en.trim();
  const changeCategory = (c: SmsCategory) => {
    // A new template follows the suggested text of its category until the registrar edits it.
    if (!template && so === STARTERS[category].so && en === STARTERS[category].en) { setSo(STARTERS[c].so); setEn(STARTERS[c].en); }
    setCategory(c);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await saveSmsTemplate(template?.id ?? null, { name: name.trim(), category, bodySo: so.trim(), bodyEn: en.trim(), ...(template ? { isActive: active } : {}) });
      toast(t("admin.saved"));
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" title={template ? t("admin.sms.editTemplate") : t("admin.sms.addTemplate")} description={t("admin.sms.placeholders")} closeLabel={t("common.cancel")}
      footer={<><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="sms-template-form" loading={busy} disabled={!ok}>{t("common.save")}</Button></>}>
      <form id="sms-template-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.sms.name")} required>{({ id }) => <Input id={id} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t("admin.sms.categoryLabel")} required>
            {({ id }) => (
              <Select id={id} value={category} onChange={(e) => changeCategory(e.target.value as SmsCategory)}>
                {SMS_CATEGORIES.map((c) => <option key={c} value={c}>{t(`admin.sms.category.${c}`)}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <TextPair so={so} en={en} onSo={setSo} onEn={setEn} />
        {template && <Check label={t("admin.sms.active")} checked={active} onChange={setActive} />}
      </form>
    </Modal>
  );
}

function TemplatesTab() {
  const { t, locale } = useI18n();
  const templates = useApi<{ items: SmsTemplate[] }>(paths.smsTemplates());
  const [modal, setModal] = useState<{ template?: SmsTemplate } | null>(null);
  const columns: Column<SmsTemplate>[] = [
    { key: "name", header: t("admin.sms.name"), primary: true, cell: (x) => <span className="block min-w-0"><span className="block font-semibold text-foreground">{x.name}</span><span className="block text-xs text-muted">{t(`admin.sms.category.${x.category}`)}</span></span> },
    { key: "text", header: t("admin.sms.text"), cell: (x) => <span className="line-clamp-2 block max-w-md text-sm text-muted">{locale === "so" ? x.bodySo : x.bodyEn}</span> },
    { key: "status", header: t("admin.status"), cell: (x) => <Badge tone={x.isActive ? "success" : "neutral"} dot>{x.isActive ? t("admin.sms.active") : t("admin.sms.off")}</Badge> },
    { key: "updated", header: t("admin.sms.updated"), className: "hidden lg:table-cell", cell: (x) => <span className="text-sm text-muted">{formatDateTime(x.updatedAt, locale)} · {x.updatedBy.fullName}</span> },
    { key: "actions", header: <span className="sr-only">{t("table.actions")}</span>, align: "right", cell: (x) => <Button variant="ghost" size="sm" leftIcon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setModal({ template: x })}>{t("common.edit")}</Button> },
  ];
  return (
    <Card className="overflow-hidden">
      <CardHeader title={t("admin.sms.templatesTitle")} description={t("admin.sms.templatesHint")} className="pb-4" action={<Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({})}>{t("admin.sms.addTemplate")}</Button>} />
      {templates.error && !templates.data ? <QueryError state={templates} /> : <DataTable columns={columns} rows={templates.data?.items ?? []} rowKey={(x) => x.id} loading={!templates.data} emptyTitle={t("admin.sms.noTemplates")} caption={t("admin.sms.templatesTitle")} />}
      {modal && <TemplateModal template={modal.template} onClose={() => setModal(null)} />}
    </Card>
  );
}

function OutboxTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi<SmsOutboxPage>(paths.smsOutbox({ status: status || undefined, page, pageSize: 25 }), { keepPrevious: true });
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const retry = async (id: string) => {
    setRetrying(id);
    setError(null);
    try { await retrySms(id); toast(t("admin.sms.retried")); } catch (err) { setError(err); } finally { setRetrying(null); }
  };
  const columns: Column<SmsMessage>[] = [
    { key: "to", header: t("admin.sms.to"), primary: true, cell: (m) => <span className="block min-w-0"><span className="block font-semibold text-foreground">{m.recipient.fullName}</span><span className="block text-xs text-muted">{m.recipient.username} · {m.phone}</span></span> },
    { key: "body", header: t("admin.sms.text"), cell: (m) => <span className="line-clamp-2 block max-w-md text-sm text-muted">{m.body}</span> },
    {
      key: "status",
      header: t("admin.status"),
      cell: (m) => (
        <span className="block">
          <Badge tone={STATUS_TONE[m.status]} dot>{t(`admin.sms.status.${m.status}`)}</Badge>
          {m.failureReason && <span className="mt-1 block text-xs text-danger">{m.failureReason}</span>}
        </span>
      ),
    },
    { key: "date", header: t("admin.sms.created"), className: "hidden lg:table-cell", cell: (m) => <span className="text-sm whitespace-nowrap text-muted">{formatDateTime(m.createdAt, locale)}</span> },
    { key: "actions", header: <span className="sr-only">{t("table.actions")}</span>, align: "right", cell: (m) => (m.status === "FAILED" ? <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="h-3.5 w-3.5" />} loading={retrying === m.id} onClick={() => retry(m.id)}>{t("admin.sms.retry")}</Button> : null) },
  ];
  return (
    <>
      <FormError error={error} />
      <FilterBar>
        <Field label={t("admin.status")}>
          {({ id }) => (
            <Select id={id} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">{t("admin.allStatuses")}</option>
              {(["QUEUED", "SENT", "DELIVERED", "FAILED"] as const).map((s) => <option key={s} value={s}>{t(`admin.sms.status.${s}`)}{list.data?.counts[s] !== undefined ? ` (${list.data.counts[s]})` : ""}</option>)}
            </Select>
          )}
        </Field>
      </FilterBar>
      <Card className="overflow-hidden">
        {list.error && !list.data ? <QueryError state={list} /> : <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(m) => m.id} loading={!list.data} emptyTitle={t("admin.sms.noMessages")} caption={t("admin.sms.outbox")} />}
        {list.data && list.data.total > 0 && <div className="border-t border-border px-5 py-4"><Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={setPage} /></div>}
      </Card>
    </>
  );
}

export default function SmsManagementPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.sms") }]} />}
        title={t("admin.sms.title")}
        description={t("admin.sms.subtitle")}
      />
      <Alert tone="info" className="mb-4">{t("admin.sms.simulated")}</Alert>
      <Tabs defaultValue="send">
        <TabsList className="mb-4">
          <TabsTrigger value="send">{t("admin.sms.tabSend")}</TabsTrigger>
          <TabsTrigger value="templates">{t("admin.sms.tabTemplates")}</TabsTrigger>
          <TabsTrigger value="outbox">{t("admin.sms.outbox")}</TabsTrigger>
        </TabsList>
        <TabsContent value="send"><SendTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="outbox"><OutboxTab /></TabsContent>
      </Tabs>
    </>
  );
}
