"use client";

/**
 * Profile page building blocks:
 * - ProfileHeader: banner, photo (with change-photo control), name, role and identifiers;
 * - ProfileDetails: account information as label/value rows;
 * - ProfileSettings: language and theme preferences, and the security section.
 * They take a Profile, so they work the same for preview and signed-in users.
 */
import { BadgeCheck, Building2, KeyRound, Languages, Mail, MonitorSmartphone, Phone, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n";
import { useTheme } from "@/lib/theme";
import type { Profile } from "@/types/account";
import { LanguageSwitch } from "@/components/layout/header-controls";
import { AvatarPicker } from "./avatar-picker";
import { loginIdentifier } from "./profile-identity";

export function ProfileHeader({ profile, actions }: { profile: Profile; actions?: ReactNode }) {
  const { t } = useI18n();
  const [photoError, setPhotoError] = useState<string | null>(null);
  return (
    <Card className="overflow-hidden">
      <div className="relative h-32 bg-[linear-gradient(120deg,var(--navy-900)_0%,var(--navy-700)_55%,var(--sky-500)_120%)] sm:h-40">
        <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.12]" preserveAspectRatio="none" viewBox="0 0 400 100">
          <path d="M0 70 C 80 40, 160 100, 240 60 S 360 30, 400 50 L400 100 L0 100 Z" fill="white" />
          <path d="M0 85 C 100 60, 200 110, 300 75 S 380 70, 400 80 L400 100 L0 100 Z" fill="white" />
        </svg>
      </div>
      <div className="flex flex-col gap-4 px-5 pb-6 sm:flex-row sm:items-end sm:px-8">
        <AvatarPicker
          name={profile.fullName}
          src={profile.avatarUrl}
          label={t("profile.changePhoto")}
          className="-mt-16 self-start sm:-mt-14"
          onError={() => setPhotoError(t("profile.photoHint"))}
          onSelect={() => setPhotoError(null)}
        />
        <div className="min-w-0 flex-1 sm:pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{profile.fullName}</h2>
            <BadgeCheck className="h-5 w-5 text-accent" aria-hidden />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
            <Badge tone="navy">{t(`roles.${profile.role}`)}</Badge>
            <span className="inline-flex items-center gap-1.5">
              {profile.studentNumber ? <UserRound className="h-4 w-4" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
              {loginIdentifier(profile)}
            </span>
            {profile.faculty && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4" aria-hidden />
                {profile.faculty}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-subtle">{photoError ?? t("profile.photoHint")}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:pb-1">{actions}</div>}
      </div>
    </Card>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium break-words text-foreground">{value}</dd>
      </div>
    </div>
  );
}

export function ProfileDetails({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={t("profile.accountInfo")} />
      <CardContent className="pt-2">
        <dl className="divide-y divide-border">
          <DetailRow icon={UserRound} label={t("profile.fullName")} value={profile.fullName} />
          {profile.studentNumber ? (
            <DetailRow icon={BadgeCheck} label={t("profile.studentId")} value={profile.studentNumber} />
          ) : (
            <DetailRow icon={Mail} label={t("profile.email")} value={profile.email} />
          )}
          <DetailRow icon={Phone} label={t("profile.phone")} value={profile.phone} />
          <DetailRow icon={ShieldCheck} label={t("profile.role")} value={t(`roles.${profile.role}`)} />
          {profile.faculty && <DetailRow icon={Building2} label={t("profile.faculty")} value={profile.faculty} />}
          <DetailRow icon={BadgeCheck} label={t("profile.accountStatus")} value={<Badge tone="success" dot>{t("profile.active")}</Badge>} />
        </dl>
      </CardContent>
    </Card>
  );
}

export function ProfileSettings() {
  const { t } = useI18n();
  const { choice, setChoice } = useTheme();
  return (
    <Card id="settings" className="scroll-mt-24">
      <CardHeader title={t("profile.settings")} />
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Languages className="h-5 w-5 text-accent-strong" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("profile.language")}</p>
          </div>
          <LanguageSwitch />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <MonitorSmartphone className="h-5 w-5 text-accent-strong" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("topbar.theme")}</p>
          </div>
          <div role="radiogroup" aria-label={t("topbar.theme")} className="inline-flex rounded-xl border border-border bg-surface-muted p-1">
            {(["light", "dark", "system"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={choice === c}
                onClick={() => setChoice(c)}
                className={choice === c ? "rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-card" : "rounded-lg px-3 py-1 text-xs font-medium text-muted hover:text-foreground"}
              >
                {t(`theme.${c}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-muted p-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{t("profile.security")}</p>
              <p className="mt-0.5 text-sm text-muted">{t("profile.passwordHint")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-3" disabled title={t("states.comingSoonTitle")}>
            {t("profile.changePassword")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
