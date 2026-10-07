"use client";

import { useEffect, useState } from "react";
import { CreatorList } from "@/features/profile/creator-list";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchFollowerProfiles } from "@/lib/supabase/profiles";
import { getBlockedIds } from "@/lib/supabase/blocked-users";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

export default function FollowersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [followers, setFollowers] = useState<UserProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
      setFollowers([]);
      return;
    }
    fetchFollowerProfiles(user.id).then(async (profiles) => {
      const blocked = await getBlockedIds();
      if (!cancelled) setFollowers(profiles.filter((profile) => !blocked.has(profile.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <section className="space-y-3">
        <h1 className="text-h1 font-semibold text-text">{t("nav.followers")}</h1>
        <CreatorList users={followers} emptyMessage={t("profile.noFollowersYet")} />
      </section>
    </div>
  );
}
