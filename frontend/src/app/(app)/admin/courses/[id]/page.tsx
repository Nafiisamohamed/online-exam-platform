import { Suspense } from "react";
import { CourseDetail } from "@/components/admin/course-detail";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";

/** The id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function CoursePage({ params }: PageProps<"/admin/courses/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CourseDetail params={params} />
    </Suspense>
  );
}
