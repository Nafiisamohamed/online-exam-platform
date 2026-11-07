"use client";

/**
 * The dashboard: each role sees its own live overview (registrar: Phase 2,
 * lecturer: Phase 3, student: Phase 4, invigilator: Phase 5). Every overview is
 * wrapped in its role gate, so a signed-out visitor is asked to sign in
 * instead of seeing made-up numbers.
 */
import { AdminOverview } from "@/components/admin/admin-overview";
import { InvigilatorOverview } from "@/components/invigilator/invigilator-overview";
import { AdminGate, InvigilatorGate, LecturerGate, StudentGate } from "@/components/layout/role-gate";
import { LecturerOverview } from "@/components/lecturer/lecturer-overview";
import { StudentOverview } from "@/components/student/student-overview";
import { useSession } from "@/lib/session/session";

export default function DashboardPage() {
  const { role } = useSession();
  switch (role) {
    case "ADMIN":
      return <AdminGate><AdminOverview /></AdminGate>;
    case "LECTURER":
      return <LecturerGate><LecturerOverview /></LecturerGate>;
    case "STUDENT":
      return <StudentGate><StudentOverview /></StudentGate>;
    case "INVIGILATOR":
      return <InvigilatorGate><InvigilatorOverview /></InvigilatorGate>;
  }
}
