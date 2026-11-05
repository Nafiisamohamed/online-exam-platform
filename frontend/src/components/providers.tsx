"use client";

/** Client-side providers shared by every page: session, tooltips, toasts and theme syncing. */
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/overlays";
import { ToastProvider } from "@/components/ui/toast";
import { SessionProvider } from "@/lib/session/session";
import { ThemeSync } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={250}>
        <ThemeSync />
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </SessionProvider>
  );
}
