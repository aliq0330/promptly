"use client";

import Link from "next/link";
import { MessageCircle } from "@/components/icons/message-circle";
import { LikeButton } from "@/features/prompts/like-button";
import { CommentSection } from "@/features/prompts/comment-section";
import { useCommentCountDelta } from "@/features/prompts/comment-count-store";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { contentActionClassName } from "@/features/content/action-styles";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { quoteHref } from "@/lib/quotes";
import { formatCount } from "@/lib/utils";
import type { Quote } from "@/lib/supabase/quotes";

/**
 * Bir alıntının KENDİ etkileşimi (docs/history/217-*): beğeni ve yorumlar alıntının kimliğine bağlıdır (`prompt_likes.quote_id`,
 * `prompt_comments.quote_id`) — alıntılanan içeriğin beğeni/yorumlarına karışmaz, sayaçlarını değiştirmez. Mevcut `LikeButton` /
 * `CommentSection` altyapısı yeniden kullanılır (ikinci bir sistem yok). Yazma herkese açık: oturumlu her kullanıcı beğenir/yorumlar
 * (ziyaretçide düğme giriş diyaloğunu açar); hedef gizlenirse ya da engel varsa sunucu reddeder.
 */
export function QuoteLike({ quote, size = 16 }: { quote: Quote; size?: number }) {
  return <LikeButton id={quote.id} likeCount={quote.likeCount} contentType="quote" size={size} />;
}

/** Yorum sayısı + bağlantı (alıntı sayfasının yorumlarına gider); canlı sayaç `comment-count-store`'dan. */
export function QuoteCommentLink({ quote, size = 16 }: { quote: Quote; size?: number }) {
  const { t } = useTranslation();
  const delta = useCommentCountDelta(quote.id);
  const count = Math.max(0, quote.commentCount + delta);
  return (
    <Link
      href={`${quoteHref(quote.id)}#comments`}
      title={t("quotes.engage.comments")}
      aria-label={t("quotes.engage.commentsAria", { count })}
      className={contentActionClassName(false)}
    >
      <MessageCircle size={size} />
      <span aria-hidden>{formatCount(count)}</span>
    </Link>
  );
}

/** Alıntının istatistik düğmesi: sayaçlar ALINTININ kendisine aittir; alıntı kaydedilmez (yalnız Beğenenler / Yorum yapanlar). */
export function QuoteStatisticsButton({ quote, size, label }: { quote: Quote; size?: number; label?: string }) {
  return (
    <StatisticsButton
      target={{ contentType: "quote", contentId: quote.id, likeCount: quote.likeCount, commentCount: quote.commentCount }}
      size={size}
      label={label}
    />
  );
}

/** Alıntının paylaş düğmesi: bağlantı alıntının kendi sayfasıdır (hedef halka açık olduğu sürece herkes açar). */
export function QuoteShareButton({ quote, label }: { quote: Quote; label?: string }) {
  return <ShareTriggerButton label={label} target={{ contentType: "quote", quote }} />;
}

/**
 * Alıntı sayfasının ÜST etkileşim satırı (docs/history/452-*): alıntılayanın notunun hemen altında — beğeni · yorum (aşağıdaki yorumlara atlar) · istatistik · paylaş.
 * Hepsi ALINTININDIR (orijinalin sayaçlarına karışmaz); yanındaki ipucu bunu söyler.
 */
export function QuoteActionBar({ quote }: { quote: Quote }) {
  const { t } = useTranslation();
  const delta = useCommentCountDelta(quote.id);
  const commentCount = Math.max(0, quote.commentCount + delta);
  return (
    <div data-quote-engagement={quote.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="-ml-1.5 flex items-center gap-0.5" role="group" aria-label={t("quotes.engage.sectionAria")}>
        <QuoteLike quote={quote} />
        <a
          href="#comments"
          title={t("quotes.engage.comments")}
          aria-label={t("quotes.engage.commentsAria", { count: commentCount })}
          className={contentActionClassName(false)}
        >
          <MessageCircle size={16} />
          <span aria-hidden>{formatCount(commentCount)}</span>
        </a>
        <QuoteStatisticsButton quote={quote} />
        <QuoteShareButton quote={quote} />
      </div>
      <p className="min-w-0 flex-1 basis-48 text-caption text-text-muted sm:text-right">{t("quotes.page.engageHint")}</p>
    </div>
  );
}

/** Alıntının yorumları (`#comments`): çerçevenin altında; yorumlar `quote_id` ile yazılır. */
export function QuoteComments({ quote, highlightCommentId = null }: { quote: Quote; highlightCommentId?: string | null }) {
  const { t } = useTranslation();
  return (
    <section id="comments" aria-label={t("quotes.page.commentsTitle")} className="scroll-mt-20 space-y-2">
      <h2 className="text-h3 font-bold text-text">{t("quotes.page.commentsTitle")}</h2>
      <CommentSection target={{ quoteId: quote.id }} highlightCommentId={highlightCommentId} />
    </section>
  );
}
