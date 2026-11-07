import { InvigilatorGate } from "@/components/layout/role-gate";

/** Every invigilator page needs a signed-in invigilator; see RoleGate. */
export default function InvigilatorLayout({ children }: LayoutProps<"/invigilator">) {
  return <InvigilatorGate>{children}</InvigilatorGate>;
}
