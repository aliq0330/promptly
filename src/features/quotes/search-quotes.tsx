"use client";

import { useEffect, useRef, useState } from "react";
import { LoadMoreButton } from "@/features/feed/load-more";
import { Eyebrow } from "@/features/content/detail-parts";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchQuotes, type Quote, type QuoteCursor } from "@/lib/supabase/quotes";
import { QuoteCard } from "./quote-card";

/**
 * Aramadaki "Alıntılar" grubu (docs/history/217-*): metin aramasında alıntının notu ya da alıntılanan içeriğin başlığı eşleşen alıntılar,
 * gönderi gruplarının yanında normal gönderi kartlarıyla. Çipler yalnız gönderilere uygulanır, bu yüzden çipli aramada gösterilmez.
 * `onCount` üst bileşenin "sonuç yok" metnini doğru tutması için bulunan alıntı sayısını bildirir.
 */
export function SearchQuotes({ query, onCount }: { query: string; onCount: (count: number) => void }) {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [cursor, setCursor] = useState<QuoteCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    searchQuotes(query, null)
      .then((page) => {
        if (mine !== generation.current) return;
        setQuotes(page.quotes);
        setCursor(page.nextCursor);
        onCount(page.quotes.length);
      })
      .catch((err) => {
        console.error("search quotes", err);
        if (mine === generation.current) {
          setQuotes([]);
          setCursor(null);
          onCount(0);
        }
      });
    return () => {
      generation.current += 1;
    };
  }, [query, onCount]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    try {
      const page = await searchQuotes(query, cursor);
      if (mine !== generation.current) return;
      setQuotes((previous) => [...previous, ...page.quotes.filter((quote) => !previous.some((old) => old.id === quote.id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      console.error("search quotes more", err);
    }
    setLoadingMore(false);
  }

  if (quotes.length === 0) return null;
  return (
    <section className="space-y-3" data-search-quotes="">
      <Eyebrow as="h2" className="px-1">
        {t("quotes.search.title")}
        <span className="rounded-xs bg-surface-soft px-1.5 py-0.5 tabular-nums tracking-normal text-text-muted">{quotes.length}</span>
      </Eyebrow>
      <ContentGrid>
        {quotes.map((quote) => (
          <div key={quote.id} className={CONTENT_GRID_ITEM_CLASS}>
            <QuoteCard quote={quote} />
          </div>
        ))}
      </ContentGrid>
      {cursor && (
        <LoadMoreButton wrapperClassName="flex justify-center pt-1" onLoadMore={() => void loadMore()} loading={loadingMore} />
      )}
    </section>
  );
}
