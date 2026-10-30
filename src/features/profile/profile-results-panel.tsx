"use client";

import { Images } from "lucide-react";
import { ResultCard } from "@/features/prompts/result-card";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { LoadMore } from "@/features/feed/load-more";
import { ProfileEmptyState } from "@/features/profile/profile-empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchResultsByCreatorPage } from "@/lib/supabase/prompt-results";
import type { UserProfile } from "@/types";

/**
 * Profildeki "Sonuçlar" bölümü (docs/history/282-*): kişinin paylaştığı kullanıcı sonuçları, yeniden eskiye, 24'erli sayfa + otomatik
 * "daha fazla". Kartlar prompt sayfasındakiyle aynı `ResultCard`'dır (yalnız görsel; dokununca sonucun sayfası, orada "hangi promptla
 * üretildi" bağlantısı var).
 */
export function ProfileResultsPanel({ creator, isOwn }: { creator: UserProfile; isOwn: boolean }) {
  const { t } = useTranslation();
  const results = usePagedList(`results|${creator.id}`, true, (offset) => fetchResultsByCreatorPage(creator, offset));
  return (
    <PagedListState list={results}>
      {results.items.length === 0 ? (
        <ProfileEmptyState
          icon={Images}
          title={t("results.profile.emptyTitle")}
          description={isOwn ? t("results.profile.emptyOwn") : t("results.profile.emptyOther")}
          action={isOwn ? { label: t("profile.explorePrompts"), href: "/discover" } : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-profile-results="">
            {results.items.map((result) => (
              <ResultCard key={result.id} result={result} label="prompt" />
            ))}
          </div>
          <LoadMore failed={results.failed} hasMore={results.hasMore} loadingMore={results.loadingMore} onLoadMore={() => void results.loadMore()} auto />
        </>
      )}
    </PagedListState>
  );
}
