"use client";

import { PersonRow } from "@/components/ui/person-row";
import { FollowButton } from "./follow-button";
import { formatCount, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

export function CreatorRow({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  return (
    <PersonRow
      className="border-b border-border px-4 py-3 last:border-0"
      href={profileHref(user)}
      name={user.displayName}
      avatarUrl={user.avatarUrl}
      sub={`${formatCount(user.followerCount)} ${t("profile.followersSuffix")}`}
      right={<FollowButton user={user} className="shrink-0" />}
    />
  );
}
