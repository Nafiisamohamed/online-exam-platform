/**
 * Sidebar navigation for each role. Modules are added here as they are built;
 * links to modules that do not exist yet open the "coming in a later phase"
 * page, so the structure can be reviewed now.
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpenCheck, CalendarClock, ClipboardCheck, CreditCard, DoorOpen, FileQuestion,
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
        { label: "nav.courses", href: "/courses", icon: BookOpenCheck },
        { label: "nav.students", href: "/enrolment", icon: GraduationCap },
        { label: "nav.users", href: "/users", icon: Users },
        { label: "nav.rooms", href: "/rooms", icon: DoorOpen },
      ],
    },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.schedules", href: "/schedules", icon: CalendarClock },
        { label: "nav.analytics", href: "/analytics", icon: BarChart3 },
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
        { label: "nav.courses", href: "/courses", icon: BookOpenCheck },
        { label: "nav.questionBank", href: "/question-bank", icon: FileQuestion },
      ],
    },
    {
      title: "nav.sections.examinations",
      items: [
        { label: "nav.exams", href: "/exams", icon: NotebookPen },
        { label: "nav.schedules", href: "/schedules", icon: CalendarClock },
        { label: "nav.grading", href: "/grading", icon: ClipboardCheck },
        { label: "nav.results", href: "/results", icon: Award },
        { label: "nav.analytics", href: "/analytics", icon: BarChart3 },
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
