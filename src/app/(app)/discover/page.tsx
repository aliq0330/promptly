"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { FollowButton } from "@/features/profile/follow-button";
import { DiscoverFeed } from "@/features/feed/discover-feed";
import { fetchTopCreators } from "@/lib/supabase/profiles";
import { fetchPopularTags } from "@/lib/supabase/tags";
import { formatCount, profileHref, tagHref } from "@/lib/utils";
import type { Tag, UserProfile } from "@/types";

export default function DiscoverPage() {
  const [creators, setCreators] = useState<UserProfile[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    fetchTopCreators(5).then(setCreators);
    // Genuinely usage-sorted now (CLAUDE.md Bölüm 9.23) — this section used
    // to just be the full catalog sorted alphabetically.
    fetchPopularTags(12).then(setTags);
  }, []);

  return (
    <div className="space-y-8 px-4 py-6 lg:px-6">
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-text">Keşfet</h2>
        <DiscoverFeed />
      </section>

      {creators.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text">Öne Çıkan Yaratıcılar</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {creators.map((creator) => (
              <div
                key={creator.id}
                className="relative flex w-32 shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 text-center transition-colors hover:bg-accent-surface/40"
              >
                <Avatar src={creator.avatarUrl} alt={creator.displayName} size={56} />
                <span className="line-clamp-1 text-sm font-medium text-text">
                  {creator.displayName}
                </span>
                <span className="text-xs text-text-muted">
                  {formatCount(creator.followerCount)} takipçi
                </span>
                <FollowButton user={creator} className="relative z-10 w-full" />
                <Link
                  href={profileHref(creator)}
                  className="absolute inset-0 z-0"
                  aria-label={creator.displayName}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {tags.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text">Popüler Etiketler</h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link key={tag.slug} href={tagHref(tag)}>
                <Badge variant="outline" className="hover:bg-accent-surface">
                  #{tag.label}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
