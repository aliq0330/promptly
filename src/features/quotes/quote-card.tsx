"use client";

import { useState } from "react";
import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { summarizeContent } from "@/features/communities/content-summary";
import { OutputPosterPreview, OutputThumbnailStrip } from "@/features/prompts/multi-image-output-options";
import { PlayableCardArt } from "@/features/prompts/playable-card-art";
import { PaletteStrip, SpaceCoverArt } from "@/features/spaces/space-visuals";
import { SummaryTextArt } from "@/features/content/text-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import { quoteHref, quoteVerbKey } from "@/lib/quotes";
import { formatRelativeTime } from "@/lib/utils";
import type { Quote } from "@/lib/supabase/quotes";
import { QuoteCommentLink, QuoteLike } from "./quote-engagement";
import { QuoteMenu } from "./quote-menu";

/**
 * Alıntının akıştaki kartı (docs/history/217-*): başvuru gönderisinin kartıyla (`ApplicationCard`) AYNI aile — Albüm kartı
 * `ContentCardPost` (docs/history/266-*): alıntılanan içeriğin çıktısı/kapağı; tür simgesi köşede, başlık + "alıntıladı · zaman" üzerine gelince, alıntı notu; altta
 * ALINTILAYAN ve sayaçlar — sayaçlar ALINTININ kendisine aittir (alıntılanan içeriğinki değil). Karta tıklamak alıntının sayfasını açar; orijinal içeriğe oradan gidilir.
 */
export function QuoteCard({ quote }: { quote: Quote }) {
  const { t, language } = useTranslation();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const href = quoteHref(quote.id);
  const summary = quote.content ? summarizeContent(quote.content) : null;
  const poster = summary?.playable ? summary.media[0] : undefined;

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={quote.author}
        meta={`${t(quoteVerbKey(quote))} · ${formatRelativeTime(quote.createdAt, language)}`}
        typeIcon={summary?.typeIcon}
        titleInArt={Boolean(summary && summary.type !== "space" && summary.media.length === 0 && !summary.promptText)}
        status={<Badge variant="default">{t("quotes.badge")}</Badge>}
        badges={summary && <ContentTypePill icon={summary.typeIcon} label={t(summary.typeLabelKey)} detail={summary.tools.length > 0 ? null : summary.detail} />}
        menu={<QuoteMenu quote={quote} onDeleted={() => setGone(true)} />}
        art={
          summary ? (
            summary.type === "space" ? (
              <SpaceCoverArt urls={summary.spaceArt ?? []} className="aspect-[4/3] w-full overflow-hidden" iconSize={40} />
            ) : summary.playable && poster ? (
              quote.content?.type === "prompt" ? <PlayableCardArt prompt={quote.content.data} poster={poster} /> : <OutputPosterPreview media={poster} />
            ) : summary.media.length > 0 ? (
              <OutputThumbnailStrip media={summary.media} />
            ) : (
              <SummaryTextArt summary={summary} seed={quote.id} />
            )
          ) : (
            <p className="flex aspect-[4/3] w-full items-center justify-center gap-2 bg-surface-soft px-3 text-small text-text-muted">
              <EyeOff size={15} aria-hidden /> {t("quotes.card.contentGone")}
            </p>
          )
        }
        title={summary ? <ContentCardTitle href={href} title={summary.title} /> : null}
        footer={
          // `contents`: the buttons stay direct items of the shared action row; the wrapper only marks them as the QUOTE's own counters.
          <div className="contents" data-quote-engagement={quote.id}>
            <QuoteLike quote={quote} />
            <QuoteCommentLink quote={quote} />
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
