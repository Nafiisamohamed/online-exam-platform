"use client";

/**
 * Reports and analytics for the registrar (all courses). The reports
 * themselves are shared with the lecturer: see components/admin/reports.tsx.
 */
import { ExamReport, InstitutionReport } from "@/components/admin/reports";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { useI18n } from "@/lib/i18n/i18n";

export default function ReportsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.reports") }]} />}
        title={t("admin.reports.title")}
        description={t("admin.reports.subtitle")}
      />
      <Alert tone="info" className="mb-4">{t("admin.reports.exportNote")}</Alert>
      <Tabs defaultValue="institution">
        <TabsList className="mb-4">
          <TabsTrigger value="institution">{t("admin.reports.tabInstitution")}</TabsTrigger>
          <TabsTrigger value="exam">{t("admin.reports.tabExam")}</TabsTrigger>
        </TabsList>
        <TabsContent value="institution" className="outline-none"><InstitutionReport scope="admin" /></TabsContent>
        <TabsContent value="exam" className="outline-none"><ExamReport /></TabsContent>
      </Tabs>
    </>
  );
}
