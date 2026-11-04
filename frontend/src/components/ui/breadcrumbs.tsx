/** Breadcrumb trail. The last item is the current page and is not a link. */
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="rounded transition-colors hover:text-accent-strong">{item.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-foreground" : undefined}>{item.label}</span>
              )}
              {!last && <ChevronRight className="h-3.5 w-3.5 text-subtle" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
