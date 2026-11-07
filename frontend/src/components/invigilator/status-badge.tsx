"use client";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/i18n";
import type { LiveStatus, SessionState } from "@/types/invigilator";

const liveTone: Record<LiveStatus, BadgeTone> = { NOT_STARTED: "neutral", IN_PROGRESS: "success", DISCONNECTED: "warning", SUBMITTED: "navy" };
const sessionTone: Record<SessionState, BadgeTone> = { UPCOMING: "sky", OPEN: "success", CLOSED: "neutral" };

/** A student's live status. Disconnected is the only warm colour, so it stands out at a glance. */
export function LiveStatusBadge({ status }: { status: LiveStatus }) {
  const { t } = useI18n();
  return <Badge tone={liveTone[status]} dot>{t(`invigilator.status.${status}`)}</Badge>;
}

export function SessionStateBadge({ state }: { state: SessionState }) {
  const { t } = useI18n();
  return <Badge tone={sessionTone[state]} dot>{t(`invigilator.states.${state}`)}</Badge>;
}
