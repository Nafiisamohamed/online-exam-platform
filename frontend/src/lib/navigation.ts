/**
 * Sidebar navigation for each role. Every entry opens a finished page.
 *
 * Each role's modules live under their own prefix (/admin/*, /lecturer/*,
 * /student/*, /invigilator/*), so pages with the same names (courses, exams…) never clash.
 * The exam itself runs at /exam/:attemptId, outside the shell.
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpenCheck, Building2, CalendarCheck2, CalendarClock, ClipboardCheck, CreditCard, FileQuestion,
  GraduationCap, LayoutDashboard, MonitorPlay, ScrollText,
  UserRound, Users, Award, NotebookPen, History, CalendarRange, ClipboardList,
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

export const NAVIGATION: Record<Role, NavSection[]> = {
  ADMIN: [
    { title: "nav.sections.main", items: [dashboard] },
    {
      title: "nav.sections.academics",
      items: [
        { label: "nav.academicYears", href: "/admin/academic-years", icon: CalendarRange },
        { label: "nav.faculties", href: "/admin/faculties", icon: Building2 },
        { label: "nav.courses", href: "/admin/courses", icon: BookOpenCheck },
        { label: "nav.registrations", href: "/admin/registrations", icon: ClipboardList },
        { label: "nav.students", href: "/admin/enrolment", icon: GraduationCap },
        { label: "nav.users", href: "/admin/users", icon: Users },
      ],
    },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.examOversight", href: "/admin/exams", icon: NotebookPen },
        { label: "nav.scheduleRequests", href: "/admin/schedules", icon: CalendarCheck2 },
        { label: "nav.reports", href: "/admin/reports", icon: BarChart3 },
      ],
    },
    { title: "nav.sections.system", items: [{ label: "nav.activity", href: "/admin/activity", icon: History }, profile] },
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
    { title: "nav.sections.system", items: [profile] },
  ],
  INVIGILATOR: [
    { title: "nav.sections.main", items: [dashboard] },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.sessions", href: "/invigilator/sessions", icon: CalendarClock },
        { label: "nav.liveView", href: "/invigilator/live", icon: MonitorPlay },
      ],
    },
    { title: "nav.sections.system", items: [profile] },
  ],
  STUDENT: [
    { title: "nav.sections.main", items: [dashboard] },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.courses", href: "/student/courses", icon: BookOpenCheck },
        { label: "nav.myExams", href: "/student/exams", icon: ScrollText },
        { label: "nav.myResults", href: "/student/results", icon: Award },
        { label: "nav.payments", href: "/student/payments", icon: CreditCard },
      ],
    },
    { title: "nav.sections.system", items: [profile] },
  ],
};

/** True when `pathname` is the item's page or one of its sub-pages. */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
