/**
 * Sidebar navigation for each role. Modules are added here as they are built;
 * links to modules that do not exist yet open the "coming in a later phase"
 * page, so the structure can be reviewed now.
 *
 * The registrar's modules live under /admin/* and the lecturer's under
 * /lecturer/*, so they never clash with the student pages that use the same
 * names (courses, exams…).
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpenCheck, Building2, CalendarClock, ClipboardCheck, CreditCard, DoorOpen, FileQuestion,
  GraduationCap, LayoutDashboard, MessageSquareText, MonitorPlay, Palette, ScrollText, ShieldCheck,
  UserRound, Users, Award, NotebookPen,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n/i18n";
import type { Role } from "@/types/account";

export interface NavItem {
  label: MessageKey;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: MessageKey;
  items: NavItem[];
}

const dashboard: NavItem = { label: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard };
const profile: NavItem = { label: "nav.profile", href: "/profile", icon: UserRound };
const designSystem: NavItem = { label: "nav.designSystem", href: "/design-system", icon: Palette };

export const NAVIGATION: Record<Role, NavSection[]> = {
  ADMIN: [
    { title: "nav.sections.main", items: [dashboard] },
    {
      title: "nav.sections.academics",
      items: [
        { label: "nav.faculties", href: "/admin/faculties", icon: Building2 },
        { label: "nav.courses", href: "/admin/courses", icon: BookOpenCheck },
        { label: "nav.students", href: "/admin/enrolment", icon: GraduationCap },
        { label: "nav.users", href: "/admin/users", icon: Users },
        { label: "nav.rooms", href: "/rooms", icon: DoorOpen },
      ],
    },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.examOversight", href: "/admin/exams", icon: NotebookPen },
        { label: "nav.schedules", href: "/schedules", icon: CalendarClock },
        { label: "nav.reports", href: "/admin/reports", icon: BarChart3 },
      ],
    },
    {
      title: "nav.sections.records",
      items: [
        { label: "nav.payments", href: "/payments", icon: CreditCard },
        { label: "nav.smsOutbox", href: "/sms-outbox", icon: MessageSquareText },
        { label: "nav.auditLog", href: "/audit-log", icon: ShieldCheck },
      ],
    },
    { title: "nav.sections.system", items: [profile, designSystem] },
  ],
  LECTURER: [
    { title: "nav.sections.main", items: [dashboard] },
    {
      title: "nav.sections.academics",
      items: [
        { label: "nav.courses", href: "/lecturer/courses", icon: BookOpenCheck },
        { label: "nav.questionBank", href: "/lecturer/questions", icon: FileQuestion },
      ],
    },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.exams", href: "/lecturer/exams", icon: NotebookPen },
        { label: "nav.schedules", href: "/lecturer/schedules", icon: CalendarClock },
        { label: "nav.grading", href: "/lecturer/grading", icon: ClipboardCheck },
        { label: "nav.results", href: "/lecturer/results", icon: Award },
        { label: "nav.analytics", href: "/lecturer/analytics", icon: BarChart3 },
      ],
    },
    { title: "nav.sections.system", items: [profile, designSystem] },
  ],
  INVIGILATOR: [
    { title: "nav.sections.main", items: [dashboard] },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.sessions", href: "/sessions", icon: CalendarClock },
        { label: "nav.liveView", href: "/live", icon: MonitorPlay },
      ],
    },
    { title: "nav.sections.system", items: [profile, designSystem] },
  ],
  STUDENT: [
    { title: "nav.sections.main", items: [dashboard] },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.courses", href: "/courses", icon: BookOpenCheck },
        { label: "nav.myExams", href: "/my-exams", icon: ScrollText },
        { label: "nav.myResults", href: "/my-results", icon: Award },
        { label: "nav.payments", href: "/payments", icon: CreditCard },
      ],
    },
    { title: "nav.sections.system", items: [profile, designSystem] },
  ],
};

/** True when `pathname` is the item's page or one of its sub-pages. */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
