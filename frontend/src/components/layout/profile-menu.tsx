"use client";

/**
 * Header account menu: avatar, name and role on the button; a profile card
 * with quick links and sign-out in the dropdown. In preview mode it also lets
 * the reviewer switch the role the shell is shown for.
 */
import { ChevronDown, Eye, LogIn, LogOut, Settings, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import {
  Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownRadioGroup, DropdownRadioItem, DropdownSeparator, DropdownTrigger,
} from "@/components/ui/overlays";
import { ProfileIdentity } from "@/components/profile/profile-identity";
import { useI18n } from "@/lib/i18n/i18n";
import { useSession } from "@/lib/session/session";
import { ROLES, type Role } from "@/types/account";

export function ProfileMenu() {
  const { t } = useI18n();
  const { profile, role, isPreview, setPreviewRole, signOut } = useSession();
  const router = useRouter();

  return (
    <Dropdown>
      <DropdownTrigger
        className="flex items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 transition-colors hover:bg-surface-sunken data-[state=open]:bg-surface-sunken"
        aria-label={t("topbar.account")}
      >
        <Avatar name={profile.fullName} src={profile.avatarUrl} size="sm" online />
        <span className="hidden min-w-0 text-left leading-tight md:block">
          <span className="block max-w-[160px] truncate text-sm font-semibold text-foreground">{profile.fullName}</span>
          <span className="block text-xs text-muted">{t(`roles.${role}`)}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-subtle md:block" aria-hidden />
      </DropdownTrigger>
      <DropdownContent className="w-72 p-0">
        <div className="rounded-t-2xl bg-[linear-gradient(135deg,var(--accent-soft),transparent)] p-4">
          <ProfileIdentity profile={profile} roleLabel={t(`roles.${role}`)} size="lg" online />
        </div>
        <div className="p-1.5">
          <DropdownItem icon={<UserRound className="h-4 w-4" />} onSelect={() => router.push("/profile")}>{t("profile.viewProfile")}</DropdownItem>
          <DropdownItem icon={<Settings className="h-4 w-4" />} onSelect={() => router.push("/profile#settings")}>{t("profile.settings")}</DropdownItem>
          {isPreview && (
            <>
              <DropdownSeparator />
              <DropdownLabel className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" aria-hidden /> {t("preview.viewAs")}
              </DropdownLabel>
              <DropdownRadioGroup value={role} onValueChange={(v) => setPreviewRole(v as Role)}>
                {ROLES.map((r) => (
                  <DropdownRadioItem key={r} value={r}>{t(`roles.${r}`)}</DropdownRadioItem>
                ))}
              </DropdownRadioGroup>
            </>
          )}
          <DropdownSeparator />
          {isPreview ? (
            <DropdownItem icon={<LogIn className="h-4 w-4" />} onSelect={() => router.push("/sign-in")}>
              {t("nav.signIn")}
            </DropdownItem>
          ) : (
            <DropdownItem icon={<LogOut className="h-4 w-4" />} onSelect={() => void signOut().then(() => router.push("/sign-in"))}>
              {t("profile.signOut")}
            </DropdownItem>
          )}
        </div>
      </DropdownContent>
    </Dropdown>
  );
}
