/**
 * Profile picture with a graceful fallback: the photo when there is one,
 * otherwise the person's initials on a navy-to-sky gradient. An optional
 * ring and status dot are used in the header and profile pages.
 */
"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizes: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-28 w-28 text-3xl",
};

/** "Dr. Axmed Xirsi Samatar" -> "AS" (titles are skipped). */
export function initials(name: string) {
  const words = name.replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, src, size = "md", ring, online, className }: { name: string; src?: string | null; size?: AvatarSize; ring?: boolean; online?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full font-semibold tracking-wide text-white select-none",
          "bg-[linear-gradient(135deg,var(--navy-900)_0%,var(--navy-700)_55%,var(--sky-500)_130%)]",
          ring && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
          sizes[size],
        )}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- user photos come from the API, not from build-time assets
          <img src={src} alt={name} className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <span aria-label={name}>{initials(name)}</span>
        )}
      </span>
      {online !== undefined && (
        <span
          aria-hidden
          className={cn("absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-surface", online ? "bg-success" : "bg-subtle")}
        />
      )}
    </span>
  );
}
