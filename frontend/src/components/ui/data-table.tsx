/**
 * Data table. On wide screens it is a normal table; on phones every row turns
 * into a compact card (label + value pairs), so nothing needs horizontal
 * scrolling. Columns marked `primary` are used as the card's title.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "./states";
import { Skeleton } from "./spinner";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Shown as the title of the mobile card. */
  primary?: boolean;
  align?: "left" | "right";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: ReactNode;
  emptyHint?: ReactNode;
  caption?: string;
}

export function DataTable<T>({ columns, rows, rowKey, loading, emptyTitle, emptyHint, caption }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2 p-5">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyHint} />;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);

  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-border bg-surface-muted">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-5 py-3 text-xs font-semibold tracking-wide text-muted uppercase", c.align === "right" ? "text-right" : "text-left", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-surface-muted">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-5 py-3.5 text-text", c.align === "right" && "text-right", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="space-y-2 px-4 py-4">
            <div className="font-semibold text-foreground">{primary.cell(row)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted">{c.header}</dt>
                  <dd className="text-right text-text">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
