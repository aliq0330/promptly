"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreatorList } from "@/features/profile/creator-list";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchFollowedProfiles } from "@/lib/supabase/profiles";
import { fetchPromptsByAuthors } from "@/lib/supabase/prompts";
import type { Prompt, UserProfile } from "@/types";

export default function FollowingPage() {
  const { user, loading } = useAuth();
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

  if (!loading && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Giriş yapmalısın</h1>
        <p className="mb-4 text-sm text-text-muted">
          Takip ettiklerini görmek için önce giriş yapmalısın.
        </p>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
        >
          Giriş Yap
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <section className="space-y-3">
        <h1 className="text-base font-semibold text-text">Takip Ettiklerim</h1>
        <CreatorList users={followed} />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text">Son paylaşımları</h2>
        <PromptGrid prompts={feed} />
      </section>
    </div>
  );
}
