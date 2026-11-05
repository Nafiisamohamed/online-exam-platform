import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { ExamDetail } from "@/components/admin/exam-detail";

/** The id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function ExamPage({ params }: PageProps<"/admin/exams/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ExamDetail params={params} />
    </Suspense>
  );
}
