"use client";

import { Lock } from "@/components/icons/lock";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";

/** "Topluluğa özel" (docs/history/478-*): a post created INSIDE a community (`community_id` set) says so in the kicker, next to its type. */
export function CommunityOnlyBadge({ communityId }: { communityId?: string | null }) {
  const { t } = useTranslation();
  if (!communityId) return null;
  return (
    <Badge variant="neutral" className="shrink-0" data-community-only="">
      <Lock size={12} aria-hidden />
      {t("card.row.communityOnly")}
    </Badge>
  );
}
