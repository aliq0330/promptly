"use client";

import { CreatorList } from "@/features/profile/creator-list";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { fetchFollowerProfilesPage } from "@/lib/supabase/profiles";
import { getBlockedIds } from "@/lib/supabase/blocked-users";
import { useTranslation } from "@/lib/i18n/language-provider";

export default function FollowersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // A page at a time, the next by itself on scroll (docs/history/257-*): a person can have tens of thousands of followers.
  const followers = usePagedList(`followers|${user?.id ?? ""}`, Boolean(user), async (offset) => {
    const [page, blocked] = await Promise.all([fetchFollowerProfilesPage(user?.id ?? "", offset), getBlockedIds()]);
    return { ...page, items: page.items.filter((profile) => !blocked.has(profile.id)) };
  });

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <section className="space-y-3">
        <h1 className="text-h1 font-semibold text-text">{t("nav.followers")}</h1>
        <PagedListState list={followers} skeleton={<p className="py-10 text-center text-sm text-text-muted">{t("common.loading")}</p>}>
          <CreatorList users={followers.items} emptyMessage={t("profile.noFollowersYet")} />
        </PagedListState>
      </section>
    </div>
  );
}
