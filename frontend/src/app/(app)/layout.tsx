import { AppShell } from "@/components/layout/app-shell";

/** Every signed-in page (all four roles) is shown inside the shared shell. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
