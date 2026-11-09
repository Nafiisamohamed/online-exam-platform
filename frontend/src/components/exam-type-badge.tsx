"use client";

/** Quiz / Midterm / Final, in the user's language. */
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/i18n";

const TONE = { QUIZ: "sky", MIDTERM: "warning", FINAL: "danger" } as const;

export function ExamTypeBadge({ type }: { type: "QUIZ" | "MIDTERM" | "FINAL" | undefined | null }) {
  const { t } = useI18n();
  if (!type) return null;
  return <Badge tone={TONE[type]}>{t(`examTypes.${type}`)}</Badge>;
}
