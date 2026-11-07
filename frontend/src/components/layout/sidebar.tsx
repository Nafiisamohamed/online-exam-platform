"use client";

/**
 * Sidebar navigation. On desktop it collapses to an icon rail (the choice is
 * remembered); collapsed items show their label as a tooltip. On phones and
 * tablets the same navigation opens as a drawer from the top-bar menu button.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/i18n";
import { isActive, NAVIGATION } from "@/lib/navigation";
import { useSession } from "@/lib/session/session";
import { Tooltip } from "@/components/ui/overlays";
import { BrandLogo } from "./brand-logo";

function Brand({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Link href="/dashboard" className="flex items-center gap-3 rounded-xl outline-none">
      <BrandLogo size={40} />
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-bold tracking-tight text-white">{t("app.shortName")}</span>
          <span className="block truncate text-xs text-sidebar-muted">{t("app.university")}</span>
        </span>
      )}
    </Link>
  );
}

type NavListProps = { compact?: boolean; onNavigate?: () => void };

/**
 * The current URL is only known at request time on dynamic routes, so the
 * active highlight streams in; until then the same menu shows without it.
 */
function NavList(props: NavListProps) {
  return (
    <Suspense fallback={<NavLinks {...props} pathname="" />}>
      <ActiveNavLinks {...props} />
    </Suspense>
  );
}

function ActiveNavLinks(props: NavListProps) {
  return <NavLinks {...props} pathname={usePathname()} />;
}

function NavLinks({ compact, onNavigate, pathname }: NavListProps & { pathname: string }) {
  const { t } = useI18n();
  const { role } = useSession();
  return (
    <nav aria-label={t("app.name")} className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
      {NAVIGATION[role].map((section) => (
        <div key={section.title}>
          {compact ? (
            <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" aria-hidden />
          ) : (
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.08em] text-sidebar-muted uppercase">{t(section.title)}</p>
          )}
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                    compact && "justify-center px-0",
                    active ? "bg-sidebar-active text-white" : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active && <span aria-hidden className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sky" />}
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-sky" : "text-sidebar-muted group-hover:text-sidebar-foreground")} aria-hidden />
                  {compact ? <span className="sr-only">{t(item.label)}</span> : <span className="truncate">{t(item.label)}</span>}
                </Link>
              );
              return <li key={item.href}>{compact ? <Tooltip content={t(item.label)} side="right">{link}</Tooltip> : link}</li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-out lg:flex",
        collapsed ? "w-[84px]" : "w-[272px]",
      )}
    >
      <div className={cn("flex h-[72px] items-center px-5", collapsed && "justify-center px-0")}>
        <Brand compact={collapsed} />
      </div>
      <NavList compact={collapsed} />
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={onToggle}
          className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-muted transition-colors hover:bg-white/5 hover:text-white", collapsed && "w-auto justify-center")}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && <span>{t("nav.collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-[rgb(11_26_48/0.55)] lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[300px] animate-slide-in-left flex-col bg-sidebar shadow-overlay outline-none lg:hidden">
          <Dialog.Title className="sr-only">{t("app.name")}</Dialog.Title>
          <Dialog.Description className="sr-only">{t("nav.openMenu")}</Dialog.Description>
          <div className="flex h-[72px] items-center justify-between px-5">
            <Brand />
            <Dialog.Close className="rounded-lg p-2 text-sidebar-muted hover:bg-white/5 hover:text-white" aria-label={t("nav.closeMenu")}>
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <NavList onNavigate={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
