import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { StudentCourseDetail } from "@/components/student/course-detail";

/** The id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function StudentCoursePage({ params }: PageProps<"/student/courses/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <StudentCourseDetail params={params} />
    </Suspense>
  );
}
