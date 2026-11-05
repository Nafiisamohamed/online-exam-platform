"use client";

/**
 * Wraps every admin page. Admin pages show live data only, so:
 * - while the session loads, a skeleton is shown;
 * - when nobody is signed in (preview mode), the page asks the user to sign in
 *   instead of showing sample numbers;
 * - a signed-in user who still has a temporary password is sent to change it
 *   (the API refuses everything else until then);
 * - other roles see a "registrar only" message.
 * The server checks the role on every request as well; this only avoids
 * showing a page the API would refuse.
 */
import { LockKeyhole, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/states";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";

export function AdminGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { isLoading, isPreview, role, profile } = useSession();
  const router = useRouter();
  const mustChange = !isPreview && profile.mustChangePassword;

  useEffect(() => {
    if (mustChange) router.replace("/sign-in");
  }, [mustChange, router]);

  if (isLoading || mustChange) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (isPreview) {
    return (
      <Card className="mt-4">
        <EmptyState
          icon={LockKeyhole}
          title={t("auth.requiredTitle")}
          description={t("auth.requiredHint")}
          className="py-20"
          action={<Link href="/sign-in" className={buttonClasses("primary")}>{t("auth.goSignIn")}</Link>}
        />
      </Card>
    );
  }

  if (role !== "ADMIN") {
    return (
      <Card className="mt-4">
        <EmptyState
          icon={ShieldAlert}
          title={t("auth.notAllowedTitle")}
          description={t("auth.notAllowedHint")}
          className="py-20"
          action={<Link href="/dashboard" className={buttonClasses("primary")}>{t("states.goHome")}</Link>}
        />
      </Card>
    );
  }

  return <>{children}</>;
}
