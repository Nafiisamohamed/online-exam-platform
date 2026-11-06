import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { ExamManage } from "@/components/lecturer/exam-manage";

/** The id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function LecturerExamPage({ params }: PageProps<"/lecturer/exams/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ExamManage params={params} />
    </Suspense>
  );
}
