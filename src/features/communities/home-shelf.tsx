"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useStorageSrc } from "@/components/ui/storage-media";
import { fetchMyUnseenCounts, listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import type { GroupInvitation } from "@/lib/supabase/chat-groups";
import { communityHref } from "@/lib/communities";
import { homeHref } from "@/lib/community-home";
import { memberCountText } from "@/lib/group-labels";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/** How many covers the shelf shows; the rest are one tap away in "Tümünü gör" (`?tab=mine`). */
const SHELF_MAX = 12;

interface ShelfState {
  communities: CommunitySummary[];
  unseen: Map<string, number>;
}

/**
 * "Topluluklarım" (docs/history/212-*, Albüm rafı): the communities I belong to as square album covers — the community's own
 * picture, its name and member count — with a "N yeni" badge for posts I have not seen yet (`my_community_unseen_counts`;
 * a failed count only hides the badges). Communities with something new come first, then the most recently active.
 * Draws nothing until loaded, and nothing for someone who has joined no community (the posts tab explains that case).
 */
export function MyCommunitiesShelf() {
  const { t } = useTranslation();
  const [state, setState] = useState<ShelfState | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listMyCommunities("member", 0), fetchMyUnseenCounts()])
      .then(([page, unseen]) => {
        if (cancelled) return;
        const activity = (c: CommunitySummary) => Date.parse(c.lastActivityAt ?? c.createdAt) || 0;
        const communities = [...page.communities].sort((a, b) => (unseen.get(b.id) ?? 0) - (unseen.get(a.id) ?? 0) || activity(b) - activity(a));
        setState({ communities: communities.slice(0, SHELF_MAX), unseen });
      })
      .catch((err) => console.error("my communities shelf", err));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state || state.communities.length === 0) return null;
  return (
    <section aria-labelledby="my-communities-shelf" className="space-y-2.5" data-testid="my-communities-shelf">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="my-communities-shelf" className="text-small text-text-muted">
          {t("communities.home.myCommunities")}
        </h2>
        <Link href={homeHref("mine")} className="text-small font-medium text-primary hover:text-primary-hover" data-testid="my-communities-link">
          {t("common.viewAll")}
        </Link>
      </div>
      <ScrollRow as="ul" className="-mx-3 gap-3 px-3 pb-2 pt-1 sm:mx-0 sm:px-0">
        {state.communities.map((community) => (
          <li key={community.id} className="w-36 shrink-0 sm:w-40">
            <ShelfCover community={community} unseen={state.unseen.get(community.id) ?? 0} />
          </li>
        ))}
      </ScrollRow>
    </section>
  );
}

function ShelfCover({ community, unseen }: { community: CommunitySummary; unseen: number }) {
  const { t, language } = useTranslation();
  // Community pictures live in the private `community-avatars` bucket: the stored URL is an id, shown through a signed URL.
  const { src } = useStorageSrc(community.avatarUrl);
  const initial = community.name.trim().charAt(0).toLocaleUpperCase(language === "tr" ? "tr" : "en");
  return (
    <Link href={communityHref(community.id)} className="group block space-y-1.5" data-shelf-community={community.id}>
      <span className="relative block aspect-[4/3] overflow-hidden rounded-[18px] bg-primary-soft transition-transform duration-200 ease-soft group-hover:-translate-y-0.5">
        {src ? (
          <Image src={src} alt="" fill sizes="160px" className="object-cover" />
        ) : (
          <span aria-hidden className="flex h-full w-full items-center justify-center font-display text-[2rem] font-extrabold text-primary">
            {initial}
          </span>
        )}
        {unseen > 0 && (
          <span
            data-shelf-unseen={unseen}
            className="absolute right-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] font-bold text-primary-foreground shadow-xs"
          >
            {t("communities.shelf.unseen", { count: unseen >= 99 ? "99+" : unseen })}
          </span>
        )}
      </span>
      <span className="block truncate text-small font-semibold leading-tight text-text group-hover:text-primary">{community.name}</span>
      <span className="block truncate text-caption text-text-muted">{memberCountText(t, community.memberCount)}</span>
    </Link>
  );
}

/**
 * A pending invitation as ONE quiet line above the posts (Albüm D): the community, who invited, and "Gör" → the invitations
 * section, where accepting runs the existing flow (rules confirmation included). Several invitations: the newest, with the count.
 */
export function HomeInviteNotice({ invitations }: { invitations: GroupInvitation[] }) {
  const { t } = useTranslation();
  const first = invitations[0];
  if (!first) return null;
  const name = first.group?.name ?? "";
  return (
    <aside data-testid="home-invite-notice" className="flex items-center gap-3 rounded-lg bg-primary-soft p-3">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-surface text-primary shadow-xs">
        <Mail size={18} strokeWidth={1.9} />
      </span>
      <p className="min-w-0 flex-1 text-small leading-snug text-text">
        <span className="block text-caption font-semibold uppercase tracking-[0.06em] text-primary">
          {invitations.length > 1 ? t("communities.invite.noticeMany", { count: invitations.length }) : t("communities.invite.noticeOne")}
        </span>
        <span className="block truncate font-semibold">{name}</span>
      </p>
      <Link href={homeHref("invites")} className={cn(buttonClassName({ size: "sm" }), "shrink-0")}>
        {t("communities.invite.noticeOpen")}
      </Link>
    </aside>
  );
}
