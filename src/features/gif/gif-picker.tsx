"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { fieldControlClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ScrollRow } from "@/components/ui/scroll-row";
import { LoadMore } from "@/features/feed/load-more";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePrefersReducedMotion } from "@/lib/motion";
import { dedupeGifs, fetchGifs, GIF_TOPICS, GiphyError, isGiphyConfigured, splitColumns, type GifItem } from "@/lib/giphy";
import { cn, publicAssetUrl } from "@/lib/utils";

type Failure = "not_configured" | "rate_limited" | "failed" | null;

/**
 * GIF seçici (docs/history/308-*) — yorumda ve mesajda AYNI pencere. Boş arama GIPHY'nin trendleridir; konu çipleri bir aramayı tek dokunuşla
 * doldurur; sonuçlar iki sütunlu "duvar" (yeni sayfa gelince mevcut GIF'ler yer değiştirmez) ve kendiliğinden devam eder. Bir GIF'e dokunmak onu
 * SEÇER ve pencereyi kapatır (`onPick`); GIF dosyası Promptly'ye indirilmez/yüklenmez, yalnız GIPHY kimliği saklanır. "Hareketi azalt" açıkken
 * önizlemeler hareketsiz ilk karedir. Kullanım koşulu gereği "Powered by GIPHY" ibaresi görünür.
 */
export function GifPicker({ onPick, onClose }: { onPick: (gif: GifItem) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [failure, setFailure] = useState<Failure>(isGiphyConfigured() ? null : "not_configured");
  const [reloadKey, setReloadKey] = useState(0);
  const loadingMoreRef = useRef(false);

  // Yazarken 350 ms bekle: her tuş vuruşu GIPHY'ye istek atmasın.
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(id);
  }, [input]);

  useEffect(() => {
    if (!isGiphyConfigured()) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- yeni arama: liste sıfırlanıp yüklenir
    setLoading(true);
    setFailure(null);
    setMoreFailed(false);
    fetchGifs(query, 0, controller.signal)
      .then((page) => {
        setItems(dedupeGifs([], page.items));
        setNextOffset(page.nextOffset);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setNextOffset(null);
        setFailure(err instanceof GiphyError ? err.code : "failed");
        setLoading(false);
      });
    return () => controller.abort();
  }, [query, reloadKey]);

  async function loadMore() {
    if (nextOffset === null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchGifs(query, nextOffset);
      setItems((prev) => [...prev, ...dedupeGifs(prev, page.items)]);
      setNextOffset(page.nextOffset);
    } catch {
      setMoreFailed(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  const columns = useMemo(() => splitColumns(items, 2), [items]);
  // Çip, arama kutusu tam olarak onun adını (ya da trend için boşu) taşıyorsa seçili görünür.
  const activeTopic = GIF_TOPICS.find((topic) => (topic === "trend" ? input.trim() === "" : input.trim().toLowerCase() === t(`gif.topic.${topic}`).toLowerCase())) ?? null;

  return (
    <Modal onClose={onClose} labelledBy="gif-picker-title">
      <div data-gif-picker className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-1 pt-4">
          <h2 id="gif-picker-title" className="font-display text-h3 font-bold text-text">
            {t("gif.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="shrink-0 space-y-2.5 px-5 pb-2 pt-2">
          <label className="relative block">
            <span className="sr-only">{t("gif.search")}</span>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("gif.search")}
              maxLength={100}
              className={cn(fieldControlClassName, "h-11 pl-10 pr-10")}
              data-gif-search
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput("")}
                aria-label={t("gif.clearSearch")}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text"
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </label>
          <ScrollRow className="gap-2" aria-label={t("gif.topicsAria")}>
            {GIF_TOPICS.map((topic) => (
              <Chip
                key={topic}
                selected={activeTopic === topic}
                onClick={() => {
                  // Çipin adı arama kutusuna yazılır (kullanıcı görüp değiştirebilir) ve arama hemen başlar.
                  const next = topic === "trend" ? "" : t(`gif.topic.${topic}`);
                  setInput(next);
                  setQuery(next);
                }}
                className="h-9"
                data-gif-topic={topic}
              >
                {t(`gif.topic.${topic}`)}
              </Chip>
            ))}
          </ScrollRow>
        </div>

        <div className="min-h-[14rem] flex-1 overflow-y-auto px-5 pb-3">
          {failure ? (
            <div role="alert" className="space-y-3 py-10 text-center">
              <p className="text-small text-text-muted">
                {failure === "not_configured" ? t("gif.notConfigured") : failure === "rate_limited" ? t("gif.rateLimited") : t("gif.loadFailed")}
              </p>
              {failure !== "not_configured" && (
                <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((n) => n + 1)}>
                  {t("common.retry")}
                </Button>
              )}
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12" role="status" aria-busy="true">
              <Loader2 size={22} className="animate-spin text-text-muted motion-reduce:animate-none" aria-hidden />
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-small text-text-muted">{t("gif.empty")}</p>
          ) : (
            <>
              <div className="flex items-start gap-2" data-gif-grid>
                {columns.map((column, index) => (
                  <div key={index} className="flex min-w-0 flex-1 flex-col gap-2">
                    {column.map((gif) => (
                      <button
                        key={gif.id}
                        type="button"
                        onClick={() => onPick(gif)}
                        aria-label={t("gif.pickAria", { title: gif.title || t("gif.untitled") })}
                        data-gif-id={gif.id}
                        style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                        className="relative block w-full overflow-hidden rounded-xl bg-surface-soft transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- GIPHY'nin kendi adresi; dış hareketli görsel */}
                        <img src={reduced ? gif.stillUrl : gif.previewUrl} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <LoadMore failed={moreFailed} hasMore={nextOffset !== null} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-soft px-5 py-3">
          <p className="text-caption leading-snug text-text-muted">{t("gif.attribution")}</p>
          {/* GIPHY'nin RESMÎ "Powered by GIPHY" işareti (public/giphy/, docs/history/309-*): kendi siyah zemini olduğundan açık/koyu her temada okunur. Değiştirilmez, kırpılmaz, kaldırılmaz. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- küçük statik PNG; next/image bir şey katmaz */}
          <img src={publicAssetUrl("/giphy/powered-by-giphy.png")} alt={t("gif.poweredBy")} width={200} height={42} draggable={false} data-giphy-attribution className="h-6 w-auto shrink-0" />
        </div>
      </div>
    </Modal>
  );
}
