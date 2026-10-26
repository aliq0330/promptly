"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { CommentSection } from "@/features/prompts/comment-section";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchSpace, fetchSpaceRatingDistribution } from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";

/** Ortalama puan, virgüllü yazım (4,6). */
export function formatRating(value: number, language: string): string {
  return value.toLocaleString(language === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Yorumlar sekmesi (docs/history/242-*): üstte puan özeti (ortalama + 5→1 dağılım), altında Space'in GENEL yorumları. Yorumla birlikte 1–5 puan
 * verilir ve yorumda görünür (kişi başına tek puan, sahibi veremez). Etkinliklerin yorumları burada değil, etkinliğin kendi sayfasındadır.
 */
export function CommentsTab() {
  const { t, language } = useTranslation();
  const { space, setSpace } = useSpaceContext();
  const hl = useSearchParams().get("hl");
  const highlightCommentId = hl?.startsWith("comment:") ? hl.slice("comment:".length) : null;
  const [dist, setDist] = useState<Record<1 | 2 | 3 | 4 | 5, number> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [distribution, fresh] = await Promise.all([fetchSpaceRatingDistribution(space.id), fetchSpace(space.id)]);
      setDist(distribution);
      // Sayaçlar sunucuda tetikleyiciyle tutulur: yalnız o alanlar sayfa durumuna işlenir (kullanıcının açık ayar penceresindeki başka alanlar ezilmez).
      if (fresh) setSpace({ ...space, ratingAvg: fresh.ratingAvg, ratingCount: fresh.ratingCount, commentCount: fresh.commentCount });
    } catch {
      // Özet okunamadı: yorumlar yine çalışır, özet eskisi gibi kalır.
    }
    // `space` her yenilemede değişir; yalnız kimliğine bağlı kal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id, setSpace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme
    void refresh();
  }, [refresh]);

  const total = dist ? Object.values(dist).reduce((a, b) => a + b, 0) : space.ratingCount;
  return (
    <div className="max-w-3xl space-y-6" data-space-comments="">
      <p className="text-small text-text-muted">{t("spaces.comments.intro")}</p>
      <section className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-6 rounded-2xl border border-border-soft bg-surface p-4 sm:p-5" aria-label={t("spaces.rating.count", { count: total })} data-space-rating-summary="">
        <div className="text-center">
          <strong className="block font-display text-[2.75rem] font-extrabold leading-none tabular-nums text-text">{total > 0 ? formatRating(space.ratingAvg, language) : "–"}</strong>
          <StarRatingDisplay value={space.ratingAvg} size={18} className="mt-1.5" />
          <p className="mt-1 text-caption text-text-muted">{total > 0 ? t("spaces.rating.count", { count: total }) : t("spaces.rating.none")}</p>
        </div>
        <div className="grid min-w-0 gap-1.5">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const count = dist?.[star] ?? 0;
            return (
              <div key={star} className="grid grid-cols-[0.875rem_minmax(0,1fr)_1.75rem] items-center gap-2 text-caption tabular-nums text-text-muted">
                <span>{star}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
                  <i className="block h-full rounded-full bg-warning" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                </span>
                <span className="text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </section>
      <CommentSection target={{ spaceId: space.id }} spaceOwnerId={space.ownerId} highlightCommentId={highlightCommentId} headless placeholder={t("spaces.comments.placeholder")} onChange={() => void refresh()} />
    </div>
  );
}
