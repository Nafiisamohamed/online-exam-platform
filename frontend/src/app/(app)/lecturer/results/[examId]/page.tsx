import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { ResultsView } from "@/components/lecturer/results-view";

/** The exam id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function ResultsPage({ params }: PageProps<"/lecturer/results/[examId]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ResultsView params={params} />
    </Suspense>
  );
}
