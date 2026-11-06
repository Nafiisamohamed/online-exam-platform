import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { ExamRunner } from "@/components/student/exam-runner";

/** The attempt id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function ExamPage({ params }: PageProps<"/exam/[attemptId]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ExamRunner params={params} />
    </Suspense>
  );
}
