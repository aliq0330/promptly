"use client";

import { EyeOff } from "@/components/icons/eye-off";
import { GraduationCap } from "@/components/icons/graduation-cap";
import type { IconComponent } from "@/components/icons/icon";
import { ContentTypePill } from "@/features/content/content-type-label";
import { SummaryTextArt } from "@/features/content/text-art";
import type { ContentSummary } from "@/features/communities/content-summary";
import { OutputPosterPreview, OutputThumbnailStrip } from "@/features/prompts/multi-image-output-options";
import { PlayableCardArt } from "@/features/prompts/playable-card-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Quote } from "@/lib/supabase/quotes";

/**
 * Alıntılanan içeriğin kart parçaları: akıştaki `QuoteCard` ve alıntı sayfasındaki `QuotedContentCard` AYNI görseli, kapak simgesini ve tür etiketini çizer
 * (ikinci bir "alıntılanan içerik" çizimi yazma).
 */

/** Kartın görseli: içeriğin çıktısı/kapağı/yazısı; Skill'de özet; içerik gittiyse "artık görünmüyor". */
export function QuotedArt({ quote, summary }: { quote: Quote; summary: ContentSummary | null }) {
  const { t } = useTranslation();
  const skill = quote.skill;
  if (summary) {
    const poster = summary.playable ? summary.media[0] : undefined;
    if (summary.playable && poster) {
      return quote.content?.type === "prompt" ? <PlayableCardArt prompt={quote.content.data} poster={poster} /> : <OutputPosterPreview media={poster} />;
    }
    if (summary.media.length > 0) return <OutputThumbnailStrip media={summary.media} />;
    return <SummaryTextArt summary={summary} seed={quote.id} />;
  }
  if (skill) {
    return (
      <p data-quote-skill-art="" className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-surface-soft px-4 text-center">
        <GraduationCap size={32} aria-hidden className="text-text-muted" />
        <span className="line-clamp-3 break-words text-small text-text-secondary">{skill.summary}</span>
      </p>
    );
  }
  return (
    <p className="flex aspect-[4/3] w-full items-center justify-center gap-2 bg-surface-soft px-3 text-small text-text-muted">
      <EyeOff size={16} aria-hidden /> {t("quotes.card.contentGone")}
    </p>
  );
}

/** Görselin üstündeki tür etiketi ("Görsel Prompt · araç", "Skill"). */
export function QuotedKicker({ quote, summary }: { quote: Quote; summary: ContentSummary | null }) {
  const { t } = useTranslation();
  if (quote.skill) return <ContentTypePill icon={GraduationCap} label={t("skill.singular")} detail={null} />;
  if (!summary) return null;
  return <ContentTypePill icon={summary.typeIcon} label={t(summary.typeLabelKey)} detail={summary.tools.length > 0 ? null : summary.detail} />;
}

/** Köşedeki yuvarlak tür simgesi. */
export function quotedTypeIcon(quote: Quote, summary: ContentSummary | null): IconComponent | undefined {
  return summary?.typeIcon ?? (quote.skill ? GraduationCap : undefined);
}

/** Görselin kendisi başlığı zaten gösteriyorsa (yazı yüzeyi) kapak katmanında başlık yalnız ekran okuyucuya kalır. */
export function quotedTitleInArt(summary: ContentSummary | null): boolean {
  return Boolean(summary && summary.media.length === 0 && !summary.promptText);
}
