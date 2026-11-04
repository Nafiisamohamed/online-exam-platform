/** Empty and error states: a calm message, an icon and an optional action, instead of a blank area. */
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

function StateBlock({ title, description, icon: Icon, action, className, tone }: StateProps & { icon: LucideIcon; tone: "sky" | "danger" }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <span
        className={cn(
          "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
          tone === "sky" ? "bg-accent-soft text-accent-strong" : "bg-danger-soft text-danger",
        )}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon = Inbox, ...props }: StateProps) {
  return <StateBlock {...props} icon={icon} tone="sky" />;
}

export function ErrorState({ icon = AlertTriangle, ...props }: StateProps) {
  return (
    <div role="alert">
      <StateBlock {...props} icon={icon} tone="danger" />
    </div>
  );
}
