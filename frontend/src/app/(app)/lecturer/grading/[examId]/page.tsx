import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { GradingQueueView } from "@/components/lecturer/grading-queue";

/** The exam id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function GradingQueuePage({ params }: PageProps<"/lecturer/grading/[examId]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <GradingQueueView params={params} />
    </Suspense>
  );
}
