import { StudentGate } from "@/components/layout/role-gate";

/** Every student page needs a signed-in student; see RoleGate. */
export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return <StudentGate>{children}</StudentGate>;
}
