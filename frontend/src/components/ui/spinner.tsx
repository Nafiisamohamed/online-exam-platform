/** Loading indicators: a spinner, and skeleton blocks that hold the layout while data loads. */
import { cn } from "@/lib/cn";

export function Spinner({ size = "md", className, label }: { size?: "sm" | "md" | "lg"; className?: string; label?: string }) {
  const dim = { sm: "h-4 w-4 border-2", md: "h-6 w-6 border-2", lg: "h-10 w-10 border-[3px]" }[size];
  return (
    <span role="status" aria-label={label} className={cn("inline-block animate-spin rounded-full border-current border-t-transparent opacity-80", dim, className)} />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--surface-sunken)_0%,var(--border)_50%,var(--surface-sunken)_100%)] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
