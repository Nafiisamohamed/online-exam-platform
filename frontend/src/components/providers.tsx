"use client";

/** Client-side providers shared by every page: session, tooltips and theme syncing. */
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/overlays";
import { SessionProvider } from "@/lib/session/session";
import { ThemeSync } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={250}>
        <ThemeSync />
        {children}
      </TooltipProvider>
    </SessionProvider>
  );
}
