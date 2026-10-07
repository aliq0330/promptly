"use client";

import { useEffect, useState } from "react";
import { CreatorList } from "@/features/profile/creator-list";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchFollowedProfiles } from "@/lib/supabase/profiles";
import { fetchPromptsByAuthors } from "@/lib/supabase/prompts";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Prompt, UserProfile } from "@/types";

export default function FollowingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [followed, setFollowed] = useState<UserProfile[]>([]);
  const [feed, setFeed] = useState<Prompt[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
      setFollowed([]);
      setFeed([]);
      return;
    }
    fetchFollowedProfiles(user.id).then(async (profiles) => {
      if (cancelled) return;
      setFollowed(profiles);
      const prompts = await fetchPromptsByAuthors(profiles.map((profile) => profile.id));
      if (!cancelled) setFeed(prompts);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <section className="space-y-3">
        <h1 className="text-h1 font-semibold text-text">{t("nav.following")}</h1>
        <CreatorList users={followed} />
      </section>
      <section className="space-y-3">
        <h2 className="text-h3 font-semibold text-text">{t("following.recentPosts")}</h2>
        <PromptGrid prompts={feed} />
      </section>
    </div>
  );
}
