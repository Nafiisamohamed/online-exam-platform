import { LecturerGate } from "@/components/layout/role-gate";

/** Every lecturer page needs a signed-in lecturer; see RoleGate. */
export default function LecturerLayout({ children }: LayoutProps<"/lecturer">) {
  return <LecturerGate>{children}</LecturerGate>;
}
