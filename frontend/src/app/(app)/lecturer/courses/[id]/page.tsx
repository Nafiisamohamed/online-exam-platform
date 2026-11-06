import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { LecturerCourseView } from "@/components/lecturer/course-view";

/** The id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function LecturerCoursePage({ params }: PageProps<"/lecturer/courses/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <LecturerCourseView params={params} />
    </Suspense>
  );
}
