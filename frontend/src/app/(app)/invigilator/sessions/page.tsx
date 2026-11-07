"use client";

/** All sessions assigned to the invigilator, grouped by the server's own session state. */
import { CalendarClock } from "lucide-react";
import { QueryState } from "@/components/admin/query-state";
import { byWindow, SessionCard } from "@/components/invigilator/session-list";
import { PageHeader } from "@/components/layout/app-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { invigilatorPaths } from "@/lib/api/invigilator";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { InvigilatorSession } from "@/types/invigilator";

export default function SessionsPage() {
  const { t } = useI18n();
  const sessions = useApi<{ items: InvigilatorSession[] }>(invigilatorPaths.sessions);
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.sessions") }]} />}
        title={t("invigilator.sessions.title")}
        description={t("invigilator.sessions.subtitle")}
      />
      <QueryState state={sessions} skeleton="h-64 w-full">
        {({ items }) => {
          if (items.length === 0) return <Card><EmptyState icon={CalendarClock} title={t("invigilator.sessions.empty")} description={t("invigilator.sessions.emptyHint")} /></Card>;
          const tabs = [
            { key: "open", label: t("invigilator.sessions.tabActive"), rows: items.filter((s) => s.state === "OPEN").sort(byWindow) },
            { key: "upcoming", label: t("invigilator.sessions.tabUpcoming"), rows: items.filter((s) => s.state === "UPCOMING").sort(byWindow) },
            { key: "done", label: t("invigilator.sessions.tabDone"), rows: items.filter((s) => s.state === "CLOSED").sort((a, b) => byWindow(b, a)) },
          ];
          return (
            <Tabs defaultValue={tabs[0].rows.length ? "open" : tabs[1].rows.length ? "upcoming" : "done"}>
              <TabsList className="mb-4">{tabs.map((tab) => <TabsTrigger key={tab.key} value={tab.key}>{tab.label} ({tab.rows.length})</TabsTrigger>)}</TabsList>
              {tabs.map((tab) => (
                <TabsContent key={tab.key} value={tab.key} className="outline-none">
                  {tab.rows.length === 0 ? (
                    <Card><EmptyState title={t("invigilator.sessions.noneHere")} /></Card>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">{tab.rows.map((s) => <SessionCard key={s.id} session={s} />)}</div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          );
        }}
      </QueryState>
    </>
  );
}
