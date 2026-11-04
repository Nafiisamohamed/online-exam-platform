"use client";

/**
 * Notification bell with an unread badge and a dropdown panel. Data comes from
 * the API (GET /api/notifications, already translated into the user's
 * language; POST /api/notifications/read-all). Nothing is shown in preview
 * mode, because there is no signed-in user whose notifications could be read.
 */
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/states";
import { iconButton } from "./header-controls";

interface AppNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string, locale: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale === "so" ? "so" : "en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  if (Math.abs(minutes) < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour");
  return rtf.format(-Math.round(minutes / 1440), "day");
}

export function NotificationMenu() {
  const { t, locale } = useI18n();
  const { isPreview } = useSession();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const unread = items?.filter((n) => !n.readAt).length ?? 0;

  const load = useCallback(() => {
    if (isPreview) return;
    api<{ items: AppNotification[] }>("/notifications").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [isPreview]);

  useEffect(() => {
    if (!isPreview) load();
  }, [isPreview, load, locale]);

  const markAll = async () => {
    await api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
    load();
  };

  return (
    <Popover onOpenChange={(open) => open && load()}>
      <Tooltip content={t("topbar.notifications")}>
        <PopoverTrigger className={cn(iconButton, "relative")} aria-label={t("topbar.notifications")}>
          {unread > 0 ? <BellRing className="h-[18px] w-[18px]" aria-hidden /> : <Bell className="h-[18px] w-[18px]" aria-hidden />}
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-navy ring-2 ring-surface">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-[min(92vw,380px)] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div>
            <p className="font-semibold text-foreground">{t("notifications.title")}</p>
            {unread > 0 && <p className="text-xs text-muted">{t("notifications.unread", { count: unread })}</p>}
          </div>
          {unread > 0 && (
            <button type="button" onClick={markAll} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-accent-strong hover:bg-accent-soft">
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        <div className="max-h-[60dvh] overflow-y-auto">
          {!isPreview && items === null ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !items || items.length === 0 ? (
            <EmptyState icon={Bell} title={t("notifications.empty")} description={t("notifications.emptyHint")} className="py-10" />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id} className={cn("flex gap-3 px-4 py-3.5", !n.readAt && "bg-accent-soft/60")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                    <p className="mt-1 text-xs text-subtle">{timeAgo(n.createdAt, locale)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
