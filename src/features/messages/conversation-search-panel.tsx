"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { searchConversationMessages } from "@/lib/supabase/chat-features";
import { normalizeSearchTerm, SEARCH_MAX_CHARS, SEARCH_MIN_CHARS, snippetAround, splitHighlight, stepIndex } from "@/lib/chat-features";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ConversationSearchHit } from "@/types";

const DEBOUNCE_MS = 300;

/**
 * Sohbet içi arama çubuğu (docs/history/174-*). Yalnız bu sohbetin, kullanıcının görebildiği mesajlarında arar (sunucu RPC'si RLS ve
 * kişisel temizle/sil kurallarını uygular; istemci tüm geçmişi indirmez — sayfalı, 20'şer sonuç). Sonuçta bir satıra dokunmak ya da
 * ▲/▼ ile gezmek `onJump` ile mesaja götürür. Girdi 2–100 karakter; eski bir isteğin geç gelen yanıtı yeni sonucu ezmez.
 */
export function ConversationSearchPanel({
  conversationId,
  senderLabel,
  onJump,
  onClose,
  onSenderIds,
}: {
  conversationId: string;
  senderLabel: (senderId: string) => string;
  onJump: (hit: ConversationSearchHit) => void;
  onClose: () => void;
  /** Sonuçlardaki gönderenlerin kimlikleri (grupta adlarını çözmek için üst bileşen profilleri çeker). */
  onSenderIds?: (ids: string[]) => void;
}) {
  const { t, language } = useTranslation();
  const [input, setInput] = useState("");
  const [hits, setHits] = useState<ConversationSearchHit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listOpen, setListOpen] = useState(true);
  const requestRef = useRef(0);
  const term = normalizeSearchTerm(input);

  useEffect(() => {
    onSenderIds?.([...new Set(hits.map((hit) => hit.senderId))]);
  }, [hits, onSenderIds]);

  const run = useCallback(
    async (searchTerm: string, append: boolean, before?: { createdAt: string; id: string }) => {
      const request = ++requestRef.current;
      setStatus("loading");
      try {
        const page = await searchConversationMessages(conversationId, searchTerm, before);
        if (request !== requestRef.current) return null;
        setHits((prev) => (append ? [...prev, ...page.hits.filter((h) => !prev.some((p) => p.id === h.id))] : page.hits));
        setHasMore(page.hasMore);
        setStatus("done");
        return page.hits;
      } catch (err) {
        if (request !== requestRef.current) return null;
        console.error("searchConversationMessages", err);
        setStatus("error");
        return null;
      }
    },
    [conversationId],
  );

  useEffect(() => {
    if (!term) {
      requestRef.current += 1;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- girdi geçersizleşince eski sonuçlar temizlenir (dış sistemle senkron değil, girdiden türeyen sıfırlama)
      setHits([]);
      setHasMore(false);
      setStatus("idle");
      setActiveIndex(-1);
      return;
    }
    setListOpen(true);
    const timer = setTimeout(() => {
      setActiveIndex(-1);
      void run(term, false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, run]);

  function jumpTo(index: number) {
    const hit = hits[index];
    if (!hit) return;
    setActiveIndex(index);
    setListOpen(false);
    onJump(hit);
  }

  async function step(direction: 1 | -1) {
    if (hits.length === 0 || !term) return;
    // Listenin sonuna gelindiyse ve devamı varsa önce yeni sayfa yüklenir (hepsini baştan indirmeden).
    if (direction === 1 && activeIndex === hits.length - 1 && hasMore) {
      const last = hits[hits.length - 1];
      const more = await run(term, true, { createdAt: last.createdAt, id: last.id });
      if (more && more.length > 0) jumpTo(activeIndex + 1);
      return;
    }
    jumpTo(stepIndex(activeIndex, hits.length, direction));
  }

  const tooShort = input.trim().length > 0 && !term;

  return (
    <div role="search" data-conversation-search className="relative border-b border-border-soft bg-surface px-2 py-2 lg:px-4">
      <div className="flex items-center gap-1">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("chat.search.open")}</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            autoFocus
            value={input}
            maxLength={SEARCH_MAX_CHARS}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && hits.length > 0) void step(1);
            }}
            placeholder={t("chat.search.placeholder")}
            className="h-9 w-full rounded-full border border-border-soft bg-background pl-9 pr-8 text-sm text-text placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput("")}
              aria-label={t("chat.search.clear")}
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text"
            >
              <X size={13} />
            </button>
          )}
        </label>
        {hits.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setListOpen((open) => !open)}
              aria-expanded={listOpen}
              aria-label={t("chat.search.resultsAria")}
              className="shrink-0 rounded-md px-1.5 py-1 text-caption tabular-nums text-text-muted hover:bg-surface-soft hover:text-text"
            >
              {activeIndex >= 0 ? t("chat.search.position", { index: activeIndex + 1, total: hasMore ? `${hits.length}+` : hits.length }) : hasMore ? `${hits.length}+` : hits.length}
            </button>
            <button
              type="button"
              onClick={() => void step(-1)}
              aria-label={t("chat.search.prev")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              onClick={() => void step(1)}
              aria-label={t("chat.search.next")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
            >
              <ChevronDown size={16} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("chat.search.close")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
        >
          <X size={16} />
        </button>
      </div>

      <div aria-live="polite" className="sr-only">
        {status === "loading" ? t("chat.search.loading") : ""}
      </div>

      {(tooShort || status === "loading" || status === "error" || (status === "done" && hits.length === 0) || (listOpen && hits.length > 0)) && (
        <div className="absolute inset-x-2 top-full z-20 mt-1 max-h-[min(50vh,22rem)] overflow-y-auto rounded-lg border border-border-soft bg-surface-elevated shadow-pop lg:inset-x-4">
          {tooShort && <p className="px-4 py-3 text-small text-text-muted">{t("chat.search.minChars", { min: SEARCH_MIN_CHARS })}</p>}
          {!tooShort && status === "loading" && hits.length === 0 && <p className="px-4 py-3 text-small text-text-muted">{t("chat.search.loading")}</p>}
          {status === "error" && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-small text-danger">
              <span>{t("chat.search.error")}</span>
              {term && (
                <button type="button" onClick={() => void run(term, false)} className="font-medium text-primary hover:underline">
                  {t("common.retry")}
                </button>
              )}
            </div>
          )}
          {status === "done" && hits.length === 0 && term && <p className="px-4 py-3 text-small text-text-muted">{t("chat.search.empty")}</p>}
          {listOpen && hits.length > 0 && (
            <ul aria-label={t("chat.search.resultsAria")} className="divide-y divide-border-soft">
              {hits.map((hit, index) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    data-search-hit={hit.id}
                    onClick={() => jumpTo(index)}
                    className={cn("block w-full px-4 py-2.5 text-left transition-colors hover:bg-surface-soft", index === activeIndex && "bg-primary-soft/60")}
                  >
                    <span className="flex items-center gap-2 text-caption text-text-muted">
                      <span className="max-w-[10rem] truncate font-semibold text-text-secondary">{senderLabel(hit.senderId)}</span>
                      <span>{formatRelativeTime(hit.createdAt, language)}</span>
                    </span>
                    <span className="mt-0.5 block break-words text-sm text-text">
                      {splitHighlight(snippetAround(hit.body, term ?? ""), term ?? "").map((part, i) =>
                        part.match ? (
                          <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-text">
                            {part.text}
                          </mark>
                        ) : (
                          <span key={i}>{part.text}</span>
                        ),
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {hasMore && (
                <li>
                  <button
                    type="button"
                    disabled={status === "loading"}
                    onClick={() => {
                      const last = hits[hits.length - 1];
                      if (term && last) void run(term, true, { createdAt: last.createdAt, id: last.id });
                    }}
                    className="block w-full px-4 py-2.5 text-center text-small font-medium text-primary hover:bg-surface-soft disabled:opacity-60"
                  >
                    {status === "loading" ? t("common.loadingMore") : t("chat.search.loadMore")}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
