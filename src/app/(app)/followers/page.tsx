"use client";

import { PageContainer } from "@/components/ui/page-header";
import { CreatorList } from "@/features/profile/creator-list";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { fetchFollowerProfilesPage } from "@/lib/supabase/profiles";
import { getBlockedIds } from "@/lib/supabase/blocked-users";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePhoneDuplicateClass } from "@/components/layout/phone-title";
import { cn } from "@/lib/utils";

export default function FollowersPage() {
  const { t } = useTranslation();
  const duplicate = usePhoneDuplicateClass(t("nav.followers"));
  const { user } = useAuth();
  // A page at a time, the next by itself on scroll (docs/history/257-*): a person can have tens of thousands of followers.
  const followers = usePagedList(`followers|${user?.id ?? ""}`, Boolean(user), async (offset) => {
    const [page, blocked] = await Promise.all([fetchFollowerProfilesPage(user?.id ?? "", offset), getBlockedIds()]);
    return { ...page, items: page.items.filter((profile) => !blocked.has(profile.id)) };
  });

  return (
    <PageContainer className="space-y-6">
      <section className="space-y-3">
        <h1 className={cn("text-h1 font-bold text-text", duplicate)}>{t("nav.followers")}</h1>
        <PagedListState list={followers} skeleton={<p className="py-10 text-center text-small text-text-muted">{t("common.loading")}</p>}>
          <CreatorList users={followers.items} emptyMessage={t("profile.noFollowersYet")} />
        </PagedListState>
      </section>
    </PageContainer>
  );
}
