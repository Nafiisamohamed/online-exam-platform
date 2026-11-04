"use client";

/** Profile page foundation: header, account details and preferences for the current user. */
import { PencilLine } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { ProfileDetails, ProfileHeader, ProfileSettings } from "@/components/profile/profile-panels";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";

export default function ProfilePage() {
  const { t } = useI18n();
  const { profile } = useSession();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("profile.title") }]} />}
        title={t("profile.title")}
        description={t("profile.subtitle")}
      />
      <div className="space-y-6">
        <ProfileHeader
          profile={profile}
          actions={<Button variant="secondary" leftIcon={<PencilLine className="h-4 w-4" />} disabled title={t("states.comingSoonTitle")}>{t("profile.editProfile")}</Button>}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <ProfileDetails profile={profile} />
          <ProfileSettings />
        </div>
      </div>
    </>
  );
}
