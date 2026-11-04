"use client";

/** Page navigation for lists that use the API's { items, total, page, pageSize } shape. */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/cn";

export function Pagination({ page, pageSize, total, onPageChange, className }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void; className?: string }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // A compact window of page numbers around the current page.
  const numbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);

  const btn = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors disabled:opacity-40";
  return (
    <nav aria-label="Pagination" className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}>
      <p className="text-sm text-muted">{t("pagination.showing", { from, to, total })}</p>
      <div className="flex items-center gap-1">
        <button type="button" className={cn(btn, "text-muted hover:bg-surface-sunken")} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label={t("common.previous")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {numbers.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - numbers[i - 1] > 1 && <span className="px-1 text-subtle">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(btn, n === page ? "bg-primary text-primary-foreground" : "text-text hover:bg-surface-sunken")}
            >
              {n}
            </button>
          </span>
        ))}
        <button type="button" className={cn(btn, "text-muted hover:bg-surface-sunken")} onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label={t("common.next")}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
