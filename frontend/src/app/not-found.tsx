"use client";

/** 404 page in the platform style (outside the shell, so it also works for unknown top-level paths). */
import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { useI18n } from "@/lib/i18n/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream px-4">
      <EmptyState
        icon={SearchX}
        title={t("states.notFoundTitle")}
        description={t("states.notFoundHint")}
        action={<Link href="/dashboard" className={buttonClasses("primary")}>{t("states.goHome")}</Link>}
      />
    </main>
  );
}
