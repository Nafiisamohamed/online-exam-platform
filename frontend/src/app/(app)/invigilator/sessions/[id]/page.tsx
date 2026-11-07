import { Suspense } from "react";
import { DetailSkeleton } from "@/components/admin/detail-skeleton";
import { SessionMonitor } from "@/components/invigilator/session-monitor";

/** The session id is only known at request time, so it is read inside Suspense (Cache Components). */
export default function MonitorPage({ params }: PageProps<"/invigilator/sessions/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <SessionMonitor params={params} />
    </Suspense>
  );
}
