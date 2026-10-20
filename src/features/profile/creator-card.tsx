"use client";

import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { CardBandBackdrop } from "@/features/content/content-card";
import { formatCount, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { FollowButton } from "./follow-button";
import type { UserProfile } from "@/types";

/**
 * Creator tile (Explore → Yaratıcılar, "Öne çıkan yaratıcılar" strips) as an Albüm card (docs/history/203-*): the band
 * takes the avatar's colours, a ringed avatar + name + @handle in it; under it the bio, the follower count and Takip Et.
 */
export function CreatorCard({ creator }: { creator: UserProfile }) {
  const { t } = useTranslation();
  return (
    <article className="group relative flex flex-col rounded-xl border border-border-soft bg-surface shadow-card transition-[border-color,box-shadow] duration-200 hover:border-border hover:shadow-card-hover">
      <div className="relative rounded-t-xl px-4 pb-4 pt-4">
        <CardBandBackdrop backdrop={creator.avatarUrl ? <Image src={creator.avatarUrl} alt="" fill sizes="240px" className="object-cover" /> : undefined} />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex shrink-0 rounded-full border-[3px] border-surface bg-surface shadow-pop">
            <Avatar src={creator.avatarUrl} alt={creator.displayName} size={52} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h3 className="truncate font-display text-[1.125rem] font-extrabold tracking-[-0.015em] text-text">
              <Link href={profileHref(creator)} className="relative z-10 hover:text-primary">
                {creator.displayName}
              </Link>
            </h3>
            <p className="truncate text-caption text-text-secondary">@{creator.username}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {creator.bio && <p className="line-clamp-2 text-caption text-text-secondary">{creator.bio}</p>}
        <div className="mt-auto flex items-center justify-between gap-2">
          <FollowButton user={creator} size="md" className="relative z-10" />
          <span className="text-caption text-text-muted">
            <span className="font-semibold tabular-nums text-text">{formatCount(creator.followerCount)}</span> {t("profile.followersSuffix")}
          </span>
        </div>
      </div>
      <Link href={profileHref(creator)} className="absolute inset-0 z-0 rounded-xl" aria-hidden tabIndex={-1} />
    </article>
  );
}
