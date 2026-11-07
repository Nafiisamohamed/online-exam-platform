"use client";

/** Live monitoring entry: the assigned sessions that are in session now (the server's OPEN state). */
import { MonitorPlay } from "lucide-react";
import { QueryState } from "@/components/admin/query-state";
import { byWindow, SessionCard } from "@/components/invigilator/session-list";
import { PageHeader } from "@/components/layout/app-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { invigilatorPaths } from "@/lib/api/invigilator";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { InvigilatorSession } from "@/types/invigilator";

export default function LivePage() {
  const { t } = useI18n();
  const sessions = useApi<{ items: InvigilatorSession[] }>(invigilatorPaths.sessions);
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.liveView") }]} />}
        title={t("invigilator.live.title")}
        description={t("invigilator.live.subtitle")}
      />
      <QueryState state={sessions} skeleton="h-48 w-full">
        {({ items }) => {
          const open = items.filter((s) => s.state === "OPEN").sort(byWindow);
          return open.length === 0 ? (
            <Card><EmptyState icon={MonitorPlay} title={t("invigilator.live.empty")} description={t("invigilator.live.emptyHint")} /></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">{open.map((s) => <SessionCard key={s.id} session={s} />)}</div>
          );
        }}
      </QueryState>
    </>
  );
}
