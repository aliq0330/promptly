"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Quote as QuoteIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { LoadMore } from "@/features/feed/load-more";
import { ProfileEmptyState } from "@/features/profile/profile-empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchProfileQuotes, type Quote, type QuoteCursor } from "@/lib/supabase/quotes";
import { QuoteCard } from "./quote-card";

/**
 * Profildeki "Alıntılar" sekmesi (docs/history/217-*): kişinin alıntıladığı gönderiler, normal gönderi kartlarıyla aynı ızgarada
 * (yeniden eskiye, keyset "Daha fazla"). Alıntılanan içeriği artık okunamayan alıntı sunucuda zaten elenir.
 */
export function ProfileQuotesPanel({ authorId, isOwn }: { authorId: string; isOwn: boolean }) {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [cursor, setCursor] = useState<QuoteCursor | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const generation = useRef(0);

  const loadFirst = useCallback(() => {
    const mine = ++generation.current;
    setStatus("loading");
    fetchProfileQuotes(authorId, null)
      .then((page) => {
        if (mine !== generation.current) return;
        setQuotes(page.quotes);
        setCursor(page.nextCursor);
        setStatus("ready");
      })
      .catch((err) => {
        console.error("profile quotes", err);
        if (mine === generation.current) setStatus("failed");
      });
  }, [authorId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme (kişi değişince yeniden)
    loadFirst();
  }, [loadFirst]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchProfileQuotes(authorId, cursor);
      if (mine !== generation.current) return;
      setQuotes((previous) => [...previous, ...page.quotes.filter((quote) => !previous.some((old) => old.id === quote.id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      console.error("profile quotes more", err);
      setMoreFailed(true);
    }
    setLoadingMore(false);
  }

  if (status === "loading") return <PromptCardSkeletonGrid count={3} />;
  if (status === "failed") {
    return <EmptyState icon={QuoteIcon} title={t("quotes.profile.loadError")} action={{ label: t("common.retry"), onClick: loadFirst }} />;
  }
  if (quotes.length === 0) {
    return <ProfileEmptyState icon={QuoteIcon} title={t("quotes.profile.tab")} description={isOwn ? t("quotes.profile.emptyOwn") : t("quotes.profile.emptyOther")} />;
  }
  return (
    <div data-profile-quotes={authorId} className="space-y-4">
      <ContentGrid>
        {quotes.map((quote) => (
          <div key={quote.id} className={CONTENT_GRID_ITEM_CLASS}>
            <QuoteCard quote={quote} />
          </div>
        ))}
      </ContentGrid>
      <LoadMore failed={moreFailed} hasMore={cursor !== null} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />
    </div>
  );
}
