import { Skeleton } from "@/components/ui/spinner";

/** Placeholder while a detail page reads its id from the URL. */
export function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-9 w-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
