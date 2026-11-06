"use client";

/**
 * The dashboard. The registrar (Phase 2), the lecturer (Phase 3) and the
 * student (Phase 4) see their live overviews. The invigilator still sees the
 * Phase 1 layout with clearly marked sample data, until their dashboard is built.
 */
import { Award, BookOpenCheck, ClipboardCheck, Users } from "lucide-react";
import { AdminGate, LecturerGate, StudentGate } from "@/components/layout/role-gate";
import { StudentOverview } from "@/components/student/student-overview";
import { LecturerOverview } from "@/components/lecturer/lecturer-overview";
import { AdminOverview } from "@/components/admin/admin-overview";
import { BarChartView, DonutChartView, HorizontalBarChartView, TrendChartView } from "@/components/charts/charts";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { useI18n } from "@/lib/i18n/i18n";
import { SAMPLE_DIFFICULTY, SAMPLE_GRADES, SAMPLE_SCORE_BANDS, SAMPLE_STATS, SAMPLE_TREND } from "@/lib/preview/sample-analytics";
import { useSession } from "@/lib/session/session";

export default function DashboardPage() {
  const { role } = useSession();
  if (role === "ADMIN") {
    return (
      <AdminGate>
        <AdminOverview />
      </AdminGate>
    );
  }
  if (role === "LECTURER") {
    return (
      <LecturerGate>
        <LecturerOverview />
      </LecturerGate>
    );
  }
  if (role === "STUDENT") {
    return (
      <StudentGate>
        <StudentOverview />
      </StudentGate>
    );
  }
  return <SampleDashboard />;
}

/** Phase 1 dashboard for the invigilator role (sample data, labelled). */
function SampleDashboard() {
  const { t } = useI18n();
  const { profile, role } = useSession();
  const sample = { label: t("preview.sampleData"), hint: t("preview.sampleDataHint") };
  const firstName = profile.fullName.replace(/^Dr\.\s+/, "").split(" ")[0];
  const totalStudents = SAMPLE_GRADES.reduce((s, g) => s + g.students, 0);

  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="sky">{t(`roles.${role}`)}</Badge>}
        title={t("dashboard.greeting", { name: firstName })}
        description={t("dashboard.subtitle")}
      />

      <section aria-label={t("preview.sampleData")} className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard emphasis label={t("dashboard.stats.activeExams")} value={SAMPLE_STATS.activeExams} icon={BookOpenCheck} change={{ value: "+1", direction: "up", caption: t("dashboard.stats.vsLastTerm") }} />
        <StatCard label={t("dashboard.stats.students")} value={SAMPLE_STATS.students} icon={Users} change={{ value: "+12%", direction: "up", caption: t("dashboard.stats.vsLastTerm") }} />
        <StatCard label={t("dashboard.stats.averageScore")} value={SAMPLE_STATS.averageScore} icon={Award} change={{ value: "+4%", direction: "up", caption: t("dashboard.stats.vsLastTerm") }} />
        <StatCard label={t("dashboard.stats.pendingGrading")} value={SAMPLE_STATS.pendingGrading} icon={ClipboardCheck} />
      </section>
      <p className="-mt-3 mb-6 text-xs text-subtle">{t("preview.sampleDataHint")}</p>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title={t("dashboard.charts.scoreDistribution")} description={t("dashboard.charts.scoreDistributionHint")} sample={sample}>
          <BarChartView data={SAMPLE_SCORE_BANDS} xKey="band" series={[{ key: "students", label: t("dashboard.charts.students") }]} />
        </ChartCard>
        <ChartCard title={t("dashboard.charts.gradeShare")} description={t("dashboard.charts.gradeShareHint")} sample={sample}>
          <DonutChartView data={SAMPLE_GRADES} nameKey="grade" valueKey="students" centerValue={totalStudents} centerLabel={t("dashboard.charts.students")} />
        </ChartCard>
        <ChartCard className="xl:col-span-2" title={t("dashboard.charts.performanceTrend")} description={t("dashboard.charts.performanceTrendHint")} sample={sample}>
          <TrendChartView
            data={SAMPLE_TREND}
            xKey="exam"
            valueSuffix="%"
            series={[
              { key: "average", label: t("dashboard.charts.average") },
              { key: "highest", label: t("dashboard.charts.highest") },
            ]}
          />
        </ChartCard>
        <ChartCard title={t("dashboard.charts.difficulty")} description={t("dashboard.charts.difficultyHint")} sample={sample}>
          <HorizontalBarChartView data={SAMPLE_DIFFICULTY} yKey="question" domainMax={100} valueSuffix="%" series={[{ key: "correct", label: t("dashboard.charts.percentCorrect"), color: "var(--chart-2)" }]} />
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("dashboard.upcoming")} />
          <EmptyState title={t("states.comingSoonTitle")} description={t("states.comingSoonHint")} />
        </Card>
        <Card>
          <CardHeader title={t("dashboard.recentActivity")} />
          <EmptyState title={t("states.comingSoonTitle")} description={t("states.comingSoonHint")} />
        </Card>
      </div>
    </>
  );
}
