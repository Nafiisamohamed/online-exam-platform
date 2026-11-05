import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { UserDetail } from "@/components/admin/user-detail";

/** The id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <UserDetail params={params} />
    </Suspense>
  );
}
