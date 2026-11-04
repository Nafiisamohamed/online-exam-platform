"use client";

/** Placeholder for sidebar links whose modules are built in later phases. */
import { Construction } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { useI18n } from "@/lib/i18n/i18n";

export default function ComingSoonPage() {
  const { t } = useI18n();
  return (
    <Card className="mt-4">
      <EmptyState
        icon={Construction}
        title={t("states.comingSoonTitle")}
        description={t("states.comingSoonHint")}
        className="py-20"
        action={<Link href="/dashboard" className={buttonClasses("primary")}>{t("states.goHome")}</Link>}
      />
    </Card>
  );
}
