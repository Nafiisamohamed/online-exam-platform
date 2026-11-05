import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { FacultyDetail } from "@/components/admin/faculty-detail";

/** The id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function FacultyPage({ params }: PageProps<"/admin/faculties/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <FacultyDetail params={params} />
    </Suspense>
  );
}
