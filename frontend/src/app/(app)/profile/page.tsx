"use client";

/** Profile page foundation: header, account details and preferences for the current user. */
import { PageHeader } from "@/components/layout/app-shell";
import { ProfileDetails, ProfileHeader, ProfileSettings } from "@/components/profile/profile-panels";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import { AccountPanel, useStudentFaculties } from "@/components/student/account-panel";

export default function ProfilePage() {
  const { t } = useI18n();
  const { profile: account } = useSession();
  // Students: the faculties of their courses (the profile endpoint has no faculty field).
  const faculties = useStudentFaculties();
  const profile = faculties ? { ...account, faculty: faculties } : account;
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
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <ProfileDetails profile={profile} />
          <ProfileSettings />
          <AccountPanel />
        </div>
      </div>
    </>
  );
}
