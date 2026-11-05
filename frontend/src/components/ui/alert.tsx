/** An inline message box: information, success, warning or a problem, with an optional title and action. */
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, { box: string; icon: LucideIcon }> = {
  info: { box: "border-accent/30 bg-accent-soft text-accent-foreground", icon: Info },
  success: { box: "border-success/25 bg-success-soft text-success", icon: CheckCircle2 },
  warning: { box: "border-warning/25 bg-warning-soft text-warning", icon: AlertTriangle },
  danger: { box: "border-danger/25 bg-danger-soft text-danger", icon: XCircle },
};

export function Alert({ tone = "info", title, children, action, className }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("text-text", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
