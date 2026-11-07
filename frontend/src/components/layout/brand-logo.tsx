/**
 * The ExamHub logo (public/brand/examhub-logo.png, transparent background).
 * Used by the sign-in page, the sidebar and the exam screen header.
 */
import Image from "next/image";
import { cn } from "@/lib/cn";

export function BrandLogo({ size = 40, className, priority }: { size?: number; className?: string; priority?: boolean }) {
  return <Image src="/brand/examhub-logo.png" alt="ExamHub" width={size} height={size} priority={priority} className={cn("shrink-0 select-none", className)} />;
}

/** The brand name with "Hub" in sky blue (a proper name: the same in both languages). */
export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-bold tracking-tight", className)}>
      Exam<span className="text-[var(--sky-500)]">Hub</span>
    </span>
  );
}
