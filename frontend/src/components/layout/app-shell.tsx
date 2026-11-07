"use client";

/**
 * The shared application frame for all four roles: sidebar, top bar and the
 * page area. Pages only render their own content inside it.
 */
import { Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/i18n";
import { createPersistedStore, usePersisted } from "@/lib/persisted-store";
import { useSession } from "@/lib/session/session";
import { STORAGE_KEYS } from "@/lib/storage";
import { Skeleton } from "@/components/ui/spinner";
import { iconButton, LanguageSwitch, ThemeMenu } from "./header-controls";
import { NotificationMenu } from "./notification-menu";
import { ProfileMenu } from "./profile-menu";
import { MobileSidebar, Sidebar } from "./sidebar";

const collapsedStore = createPersistedStore<"true" | "false">(STORAGE_KEYS.sidebarCollapsed, "false", ["true", "false"]);

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { isSignedIn, isLoading, profile } = useSession();
  const router = useRouter();
  // Pages are shown only to a signed-in user who has no temporary password left to change.
  const mustChange = isSignedIn && profile.mustChangePassword;
  const allowed = isSignedIn && !mustChange;
  useEffect(() => {
    if (isLoading) return;
    if (!isSignedIn || mustChange) router.replace(isSignedIn ? "/sign-in" : `/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, [isLoading, isSignedIn, mustChange, router]);
  const collapsed = usePersisted(collapsedStore) === "true";
  const [mobileOpen, setMobileOpen] = useState(false);

  // While the session loads (always so during the server prerender) the page itself is rendered:
  // every page sits behind a RoleGate, which shows its own skeleton until the user is known.
  if (isLoading) {
    return <div className="min-h-dvh bg-background"><main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main></div>;
  }
  if (!allowed) {
    return <div className="min-h-dvh bg-background p-8" aria-busy><Skeleton className="h-10 w-64" /><Skeleton className="mt-6 h-72 w-full max-w-4xl" /></div>;
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => collapsedStore.set(collapsed ? "false" : "true")} />
      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75">
          <div className="flex h-[72px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <button type="button" className={cn(iconButton, "lg:hidden")} onClick={() => setMobileOpen(true)} aria-label={t("nav.openMenu")}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <LanguageSwitch />
              <ThemeMenu />
              <NotificationMenu />
              <div className="mx-1 hidden h-8 w-px bg-border sm:block" aria-hidden />
              <ProfileMenu />
            </div>
          </div>
        </header>
        <main className="flex-1 bg-[linear-gradient(180deg,var(--background-cream)_0%,var(--background)_420px)]">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Title row at the top of every page: heading, description and page actions. */
export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
