/**
 * Reusable pieces that show who a person is: their login identifier (student
 * number for students, email for staff) and a compact identity block (avatar,
 * name, role badge, identifier). Used in the header menu and the profile page.
 */
import { Badge } from "@/components/ui/badge";
import { Avatar, type AvatarSize } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { Profile } from "@/types/account";

export function loginIdentifier(profile: Profile) {
  return profile.studentNumber ?? profile.email ?? "";
}

export function ProfileIdentity({
  profile, roleLabel, size = "md", className, online,
}: { profile: Profile; roleLabel: string; size?: AvatarSize; className?: string; online?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar name={profile.fullName} src={profile.avatarUrl} size={size} online={online} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{profile.fullName}</p>
        <p className="truncate text-xs text-muted">{loginIdentifier(profile)}</p>
        <Badge tone="sky" className="mt-1">{roleLabel}</Badge>
      </div>
    </div>
  );
}
