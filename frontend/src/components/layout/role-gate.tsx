"use client";

/**
 * Wraps every page of one role (registrar, lecturer, student or invigilator). These pages show live data only, so:
 * - while the session loads, a skeleton is shown;
 * - when nobody is signed in, the visitor is sent to the sign-in page (and returns here afterwards);
 * - a signed-in user who still has a temporary password is sent to change it
 *   (the API refuses everything else until then);
 * - other roles see a "this page is for …" message.
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
import type { MessageKey } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import type { Role } from "@/types/account";

type GatedRole = Extract<Role, "ADMIN" | "LECTURER" | "STUDENT" | "INVIGILATOR">;

const NOT_ALLOWED: Record<GatedRole, { title: MessageKey; hint: MessageKey }> = {
  ADMIN: { title: "auth.notAllowedTitle", hint: "auth.notAllowedHint" },
  LECTURER: { title: "auth.lecturerOnlyTitle", hint: "auth.lecturerOnlyHint" },
  STUDENT: { title: "auth.studentOnlyTitle", hint: "auth.studentOnlyHint" },
  INVIGILATOR: { title: "auth.invigilatorOnlyTitle", hint: "auth.invigilatorOnlyHint" },
};

/** Without a role: any signed-in user (pages shared by all roles, such as the profile). */
export function RoleGate({ role: required, children }: { role?: GatedRole; children: ReactNode }) {
  const { t } = useI18n();
  const { isLoading, isSignedIn, role, profile } = useSession();
  const router = useRouter();
  const mustChange = isSignedIn && profile.mustChangePassword;

  useEffect(() => {
    if (isLoading) return;
    if (mustChange) router.replace("/sign-in");
    else if (!isSignedIn) router.replace(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, [isLoading, isSignedIn, mustChange, router]);

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

  if (!isSignedIn) {
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

  if (required && role !== required) {
    const text = NOT_ALLOWED[required];
    return (
      <Card className="mt-4">
        <EmptyState
          icon={ShieldAlert}
          title={t(text.title)}
          description={t(text.hint)}
          className="py-20"
          action={<Link href="/dashboard" className={buttonClasses("primary")}>{t("states.goHome")}</Link>}
        />
      </Card>
    );
  }

  return <>{children}</>;
}

/** Registrar pages. */
export function AdminGate({ children }: { children: ReactNode }) {
  return <RoleGate role="ADMIN">{children}</RoleGate>;
}

/** Lecturer pages. */
export function LecturerGate({ children }: { children: ReactNode }) {
  return <RoleGate role="LECTURER">{children}</RoleGate>;
}

/** Student pages. */
export function StudentGate({ children }: { children: ReactNode }) {
  return <RoleGate role="STUDENT">{children}</RoleGate>;
}

/** Invigilator pages. */
export function InvigilatorGate({ children }: { children: ReactNode }) {
  return <RoleGate role="INVIGILATOR">{children}</RoleGate>;
}
