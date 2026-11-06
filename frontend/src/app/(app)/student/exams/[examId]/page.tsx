import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { StudentExamDetail } from "@/components/student/exam-detail";

/** The exam id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function StudentExamPage({ params }: PageProps<"/student/exams/[examId]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <StudentExamDetail params={params} />
    </Suspense>
  );
}
