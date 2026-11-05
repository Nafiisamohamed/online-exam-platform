import { AdminGate } from "@/components/admin/admin-gate";

/** Every registrar page needs a signed-in admin; see AdminGate. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminGate>{children}</AdminGate>;
}
