/** A key figure with an icon, an optional short hint and an optional change versus a previous period. */
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./card";

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  change?: { value: string; direction: "up" | "down"; caption?: string };
  /** One short line under the value, e.g. what the figure includes. */
  hint?: string;
  emphasis?: boolean;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, change, hint, emphasis, className }: StatCardProps) {
  return (
    <Card
      interactive
      className={cn(
        "relative overflow-hidden p-5",
        emphasis && "border-transparent bg-[linear-gradient(135deg,var(--navy-900),var(--navy-700))] text-white dark:bg-[linear-gradient(135deg,#123156,#1b4a7c)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-sm font-medium", emphasis ? "text-white/75" : "text-muted")}>{label}</p>
          <p className={cn("mt-2 text-3xl font-bold tracking-tight", emphasis ? "text-white" : "text-foreground")}>{value}</p>
        </div>
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", emphasis ? "bg-white/12 text-sky" : "bg-accent-soft text-accent-strong")}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      {hint && <p className={cn("mt-2 text-xs", emphasis ? "text-white/70" : "text-subtle")}>{hint}</p>}
      {change && (
        <p className={cn("mt-3 flex items-center gap-1 text-xs font-medium", emphasis ? "text-white/80" : "text-muted")}>
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", change.direction === "up" ? (emphasis ? "text-sky" : "text-accent-strong") : "text-danger")}>
            {change.direction === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {change.value}
          </span>
          {change.caption}
        </p>
      )}
      {emphasis && <span aria-hidden className="pointer-events-none absolute -right-10 -bottom-12 h-36 w-36 rounded-full bg-sky/20 blur-2xl" />}
    </Card>
  );
}
