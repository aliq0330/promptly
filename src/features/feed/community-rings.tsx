"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { communityHref } from "@/lib/communities";
import { listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Home's top strip (Meydan, docs/history/190-*): the communities the viewer
 * belongs to as round avatars. A warm ring marks one with unread activity
 * (`unreadCount` from `list_my_communities` — the same number the
 * Communities pages show), a quiet ring the rest. The last slot always leads
 * to community discovery. Members only; a failed load simply hides the strip
 * (the feed below never depends on it).
 */
export function CommunityRings() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<CommunitySummary[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listMyCommunities("member")
      .then((result) => {
        if (!cancelled) setCommunities(result.communities);
      })
      .catch(() => {
        if (!cancelled) setCommunities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user || communities === null) return null;

  return (
    <nav aria-label={t("home.ringsLabel")} className="scrollbar-none -mx-3 flex touch-pan-x gap-4 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:px-0">
      {communities.map((community) => {
        const fresh = community.unreadCount > 0;
        return (
          <Link
            key={community.id}
            href={communityHref(community.id)}
            className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-md text-center"
          >
            <span
              className={cn(
                "flex rounded-full border-[2.5px] p-[3px] transition-transform duration-200 ease-soft group-active:scale-95",
                fresh ? "border-secondary" : "border-border",
              )}
            >
              <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={54} />
            </span>
            <span className="w-full truncate text-caption text-text-secondary">{community.name}</span>
            {fresh && <span className="sr-only">{t("home.ringsUnread")}</span>}
          </Link>
        );
      })}
      <Link href="/communities/all" className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-md text-center">
        <span className="flex h-[66px] w-[66px] items-center justify-center rounded-full border-[1.5px] border-dashed border-border-strong text-text-muted transition-colors group-hover:border-primary group-hover:text-primary">
          <Plus size={22} strokeWidth={2} aria-hidden />
        </span>
        <span className="w-full truncate text-caption text-text-secondary">{t("home.ringsFind")}</span>
      </Link>
    </nav>
  );
}
