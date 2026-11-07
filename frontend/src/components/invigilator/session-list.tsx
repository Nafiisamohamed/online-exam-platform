"use client";

/** Session cards (from GET /api/invigilation/sessions: only the sessions assigned to this invigilator). */
import { CalendarClock, DoorOpen, Users } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatDate, formatTimeRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { InvigilatorSession } from "@/types/invigilator";
import { SessionStateBadge } from "./status-badge";

export function SessionCard({ session }: { session: InvigilatorSession }) {
  const { t, locale } = useI18n();
  return (
    <Card interactive className="p-0">
      <Link href={`/invigilator/sessions/${session.id}`} className="block space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{session.exam.title}</p>
            <p className="text-xs text-muted">{session.exam.course.code} · {session.exam.course.name}</p>
          </div>
          <SessionStateBadge state={session.state} />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text">
          <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-subtle" aria-hidden />{formatDate(session.windowStart, locale)} · {formatTimeRange(session.windowStart, session.windowEnd, locale)}</span>
          <span>{t("student.common.minutes", { count: session.durationMinutes })}</span>
        </p>
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><DoorOpen className="h-3.5 w-3.5" aria-hidden />{session.rooms.length ? session.rooms.join(", ") : t("invigilator.sessions.anyRoom")}</span>
          <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden />{t("invigilator.sessions.attempts")}: {session.attempts}</span>
        </p>
      </Link>
    </Card>
  );
}

export const byWindow = (a: InvigilatorSession, b: InvigilatorSession) => a.windowStart.localeCompare(b.windowStart);
