import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { QuestionDetail } from "@/components/lecturer/question-detail";

/** The id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function QuestionPage({ params }: PageProps<"/lecturer/questions/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <QuestionDetail params={params} />
    </Suspense>
  );
}
