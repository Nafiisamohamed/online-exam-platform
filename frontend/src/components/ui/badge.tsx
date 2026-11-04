/**
 * Small status labels. Brand tones (navy, sky, neutral) for most uses; the
 * muted success / warning / danger tones only where status must be clear.
 */
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "navy" | "sky" | "neutral" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  navy: "bg-primary text-primary-foreground",
  sky: "bg-accent-soft text-accent-strong",
  neutral: "bg-surface-sunken text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "sky", dot, className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
