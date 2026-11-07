"use client";

/**
 * Distraction-free frame for a running exam: no sidebar or menus, only the
 * brand, language and theme switches. Students only (StudentGate).
 */
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitch, ThemeMenu } from "@/components/layout/header-controls";
import { StudentGate } from "@/components/layout/role-gate";
import { useI18n } from "@/lib/i18n/i18n";

export default function ExamLayout({ children }: LayoutProps<"/exam">) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,var(--background-cream)_0%,var(--background)_420px)]">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <BrandLogo size={32} />
          <span className="text-sm font-bold text-foreground">{t("app.shortName")}</span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <LanguageSwitch />
            <ThemeMenu />
          </div>
        </div>
      </header>
      <main className="px-4 sm:px-6">
        <StudentGate>{children}</StudentGate>
      </main>
    </div>
  );
}
