"use client";

/**
 * Small pieces shared by the admin screens: status badges, the filter bar,
 * label/value lists, the one-time temporary password panel and the inline
 * form error. Everything is built from the Phase 1 components and tokens.
 */
import { Check, Copy, KeyRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExamState } from "@/lib/admin/exam-state";
import { cn } from "@/lib/cn";
import { errorText, questionErrorText } from "@/lib/i18n/error-text";
import { useI18n } from "@/lib/i18n/i18n";
import type { EnrolmentConflict, EnrolmentStatus, ResultsStatus, ScheduleStatus } from "@/types/admin";
import type { Role } from "@/types/account";
import { ApiError } from "@/lib/api/client";

// --- Badges -------------------------------------------------------------------------

export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useI18n();
  return <Badge tone={active ? "success" : "neutral"} dot>{active ? t("admin.active") : t("admin.inactive")}</Badge>;
}

const roleTone: Record<Role, BadgeTone> = { ADMIN: "navy", LECTURER: "sky", INVIGILATOR: "neutral", STUDENT: "sky" };
export function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n();
  return <Badge tone={roleTone[role]}>{t(`roles.${role}`)}</Badge>;
}

const stateTone: Record<ExamState, BadgeTone> = {
  DRAFT: "neutral", NOT_SCHEDULED: "neutral", AWAITING_APPROVAL: "warning", UPCOMING: "sky", OPEN: "success", COMPLETED: "navy",
};
export function ExamStateBadge({ state }: { state: ExamState }) {
  const { t } = useI18n();
  return <Badge tone={stateTone[state]} dot>{t(`admin.exams.states.${state}`)}</Badge>;
}

export function ResultsBadge({ status }: { status: ResultsStatus }) {
  const { t } = useI18n();
  return <Badge tone={status === "PUBLISHED" ? "success" : status === "REOPENED" ? "warning" : "neutral"}>{t(`admin.exams.results.${status}`)}</Badge>;
}

export function ScheduleBadge({ status }: { status: ScheduleStatus }) {
  const { t } = useI18n();
  const tone: BadgeTone = status === "APPROVED" ? "success" : status === "REQUESTED" ? "warning" : status === "REJECTED" ? "danger" : "neutral";
  return <Badge tone={tone}>{t(`admin.exams.scheduleStatus.${status}`)}</Badge>;
}

export function EnrolmentBadge({ status }: { status: EnrolmentStatus }) {
  const { t } = useI18n();
  return <Badge tone={status === "ACTIVE" ? "success" : "neutral"} dot>{t(`admin.enrolment.status${status}`)}</Badge>;
}

// --- Layout helpers -------------------------------------------------------------------

/** The row of search and filter controls above a list. */
export function FilterBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">{children}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </Card>
  );
}

/** Label / value rows for detail pages. */
export function DetailList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {items.map((item, i) => (
        <div key={i} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] sm:gap-4">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="min-w-0 text-sm font-medium break-words text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// --- Forms --------------------------------------------------------------------------

/**
 * The server's answer to a failed form, translated. Lists from the error's
 * details are shown one per line: exam clashes, question content problems
 * (QUESTION_INVALID) and rules without enough questions (EXAM_NOT_ENOUGH_QUESTIONS).
 */
export function FormError({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const details = error instanceof ApiError ? error.details : undefined;
  const conflicts = details?.conflicts as EnrolmentConflict[] | undefined;
  const contentErrors = details?.errors as { code: string; params?: Record<string, string | number> }[] | undefined;
  const shortages = details?.rules as { position: number; required: number; available: number }[] | undefined;
  return (
    <Alert tone="danger" title={errorText(t, error)}>
      {conflicts?.length ? (
        <>
          <p>{t("admin.enrolment.conflictIntro")}</p>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((c, i) => <li key={i}>{t("admin.enrolment.conflictLine", { ...c })}</li>)}
          </ul>
        </>
      ) : null}
      {contentErrors?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {contentErrors.map((e, i) => <li key={i}>{questionErrorText(t, e)}</li>)}
        </ul>
      ) : null}
      {shortages?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {shortages.map((s) => <li key={s.position}>{t("lecturer.exams.notEnough", { ...s })}</li>)}
        </ul>
      ) : null}
    </Alert>
  );
}

// --- Temporary passwords --------------------------------------------------------------

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the value is still visible to copy by hand */
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={copy} leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} aria-label={label}>
      {copied ? t("admin.copied") : t("admin.copy")}
    </Button>
  );
}

/** The temporary password returned once by the API. It is only kept in this component's state. */
export function TemporaryPassword({ name, login, password }: { name: string; login: string | null; password: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Alert tone="warning">{t("admin.users.tempHint", { name })}</Alert>
      <div className="rounded-xl border border-border bg-surface-muted p-4">
        {login && (
          <p className="mb-2 text-xs text-muted">
            {t("admin.users.signsInWith")}: <span className="font-semibold text-foreground">{login}</span>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-mono text-lg font-semibold tracking-wider text-foreground">
            <KeyRound className="h-4 w-4 text-accent-strong" aria-hidden />
            {password}
          </span>
          <CopyButton value={password} />
        </div>
      </div>
    </div>
  );
}
