import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { StudentResultDetail } from "@/components/student/result-detail";

/** The exam id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function StudentResultPage({ params }: PageProps<"/student/results/[examId]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <StudentResultDetail params={params} />
    </Suspense>
  );
}
