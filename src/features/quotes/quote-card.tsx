"use client";

import { useState } from "react";
import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StorageImage, StorageImg } from "@/components/ui/storage-media";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { summarizeContent } from "@/features/communities/content-summary";
import { OutputPosterPreview, OutputThumbnailStrip } from "@/features/prompts/multi-image-output-options";
import { PaletteStrip, SpaceCoverArt } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { quoteHref, quoteVerbKey } from "@/lib/quotes";
import { formatRelativeTime } from "@/lib/utils";
import type { Quote } from "@/lib/supabase/quotes";
import { QuoteCommentLink, QuoteLike, QuoteShareButton, QuoteStatisticsButton } from "./quote-engagement";
import { QuoteMenu } from "./quote-menu";

/**
 * Alıntının akıştaki kartı (docs/history/217-*): başvuru gönderisinin kartıyla (`ApplicationCard`) AYNI aile — Albüm kartı
 * `ContentCardPost`: bantta alıntılanan içeriğin çıktısı/kapağı, tür, başlık, ALINTILAYAN + "alıntıladı · zaman", alıntı notu; altbilgideki
 * sayaçlar ALINTININ kendisine aittir (alıntılanan içeriğinki değil). Karta tıklamak alıntının sayfasını açar; orijinal içeriğe oradan gidilir.
 */
export function QuoteCard({ quote }: { quote: Quote }) {
  const { t, language } = useTranslation();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const href = quoteHref(quote.id);
  const summary = quote.content ? summarizeContent(quote.content) : null;
  const poster = summary?.playable ? summary.media[0] : undefined;
  const picture = summary ? (summary.playable ? poster : summary.media[0]) : undefined;

  return (
    <ContentCard href={href}>
      <ContentCardPost
        author={quote.author}
        meta={`${t(quoteVerbKey(quote))} · ${formatRelativeTime(quote.createdAt, language)}`}
        badges={
          <>
            {summary && <ContentTypePill icon={summary.typeIcon} label={t(summary.typeLabelKey)} detail={summary.tools.length > 0 ? null : summary.detail} />}
            <Badge variant="default">{t("quotes.badge")}</Badge>
          </>
        }
        menu={<QuoteMenu quote={quote} onDeleted={() => setGone(true)} />}
        art={
          summary ? (
            summary.type === "space" ? (
              <span data-card-media className="block">
                <SpaceCoverArt urls={summary.spaceArt ?? []} className="aspect-[16/9] w-full overflow-hidden rounded-lg shadow-pop" iconSize={40} />
              </span>
            ) : summary.playable && poster ? (
              <OutputPosterPreview media={poster} />
            ) : summary.media.length > 0 ? (
              <OutputThumbnailStrip media={summary.media} />
            ) : undefined
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-4 text-small text-text-muted">
              <EyeOff size={15} aria-hidden /> {t("quotes.card.contentGone")}
            </p>
          )
        }
        backdrop={
          summary?.type === "space" ? (
            picture ? <StorageImg src={picture.url} alt="" className="h-full w-full object-cover" /> : undefined
          ) : picture ? (
            <StorageImage src={picture.url} alt="" fill sizes="240px" className="object-cover" />
          ) : undefined
        }
        tint={picture?.color}
        title={summary ? <ContentCardTitle href={href} title={summary.title} /> : null}
        footer={
          // `contents`: the buttons stay direct items of the shared action row; the wrapper only marks them as the QUOTE's own counters.
          <div className="contents" data-quote-engagement={quote.id}>
            <QuoteLike quote={quote} />
            <QuoteCommentLink quote={quote} />
            <QuoteStatisticsButton quote={quote} />
            <span className="ml-auto" />
            <QuoteShareButton quote={quote} />
          </div>
        }
      >
        {summary?.palette && summary.palette.length > 0 && <PaletteStrip colors={summary.palette} className="h-1.5" />}
        {quote.note && (
          <p data-quote-note className="whitespace-pre-wrap break-words rounded-lg bg-surface/80 px-3 py-2.5 text-small text-text-secondary">
            {quote.note}
          </p>
        )}
      </ContentCardPost>
    </ContentCard>
  );
}
