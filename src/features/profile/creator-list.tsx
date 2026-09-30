"use client";

import { CreatorRow } from "./creator-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

export function CreatorList({ users }: { users: UserProfile[] }) {
  const { t } = useTranslation();
  if (users.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">{t("profile.notFollowingAnyoneYet")}</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {users.map((user) => (
        <CreatorRow key={user.id} user={user} />
      ))}
    </div>
  );
}
