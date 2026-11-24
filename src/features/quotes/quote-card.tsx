"use client";

import { useState } from "react";
import Link from "next/link";
import { EyeOff } from "@/components/icons/eye-off";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Avatar } from "@/components/ui/avatar";
import { ContentCard } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { summarizeContent } from "@/features/communities/content-summary";
import { OutputPosterPreview, OutputThumbnailStrip } from "@/features/prompts/multi-image-output-options";
import { PlayableCardArt } from "@/features/prompts/playable-card-art";
import { PaletteStrip, SpaceCoverArt } from "@/features/spaces/space-visuals";
import { SummaryTextArt } from "@/features/content/text-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import { quoteHref, quoteVerbKey } from "@/lib/quotes";
import { cn, formatRelativeTime, profileHref, skillHref } from "@/lib/utils";
import type { Quote } from "@/lib/supabase/quotes";
import { QuoteCommentLink, QuoteLike } from "./quote-engagement";
import { QuoteMenu } from "./quote-menu";

/**
 * Alıntının akıştaki kartı (docs/history/217-*, iç içe düzen docs/history/453-*): DIŞ kart ALINTININDIR — alıntılayan ("Bob alıntıladı · 2 ay önce"), notu ve
 * ALINTININ sayaçları (beğeni/yorum; alıntılanan içeriğinki değil); İÇ kart alıntılanan ORİJİNAL içeriktir — kapağı/çıktısı, tür etiketi, başlığı ve
 * ORİJİNAL YAZARI (kendi bağlantısıyla orijinal içeriğin sayfasını açar). Dış karta (alıntılayanın satırı dışında bir yere) tıklamak alıntının sayfasını açar.
 * İçerik gittiyse iç kartın yerine "artık görünmüyor" kutusu çizilir. Kartın iç yerleşimi diğer gönderi kartlarından (`ContentCardPost`) bilerek ayrıdır: alıntı
 * "bir başkasının içeriğine kendi sözüm" olduğu için iki katman gerekir; kabuk (`ContentCard`: yüzey, uzanan bağlantı, çıkış animasyonu) aynıdır.
 */
export function QuoteCard({ quote }: { quote: Quote }) {
  const { t, language } = useTranslation();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const href = quoteHref(quote.id);
  const summary = quote.content ? summarizeContent(quote.content) : null;
  const skill = quote.skill;
  const poster = summary?.playable ? summary.media[0] : undefined;
  const originalHref = summary?.href ?? (skill ? skillHref(skill) : null);
  const title = summary?.title ?? skill?.title ?? "";
  const originalAuthor = summary?.author ?? skill?.creator ?? null;
  // Metin yüzeyi başlığı zaten çiziyor: üstteki katman yalnız ekran okuyucu/klavye için kalır.
  const titleInArt = Boolean(summary && summary.type !== "space" && summary.media.length === 0 && !summary.promptText);
  const originalName = originalAuthor?.displayName ?? t("common.genericUser");

  const art = summary ? (
    summary.type === "space" ? (
      <SpaceCoverArt urls={summary.spaceArt ?? []} className="aspect-[16/10] w-full overflow-hidden" iconSize={40} />
    ) : summary.playable && poster ? (
      quote.content?.type === "prompt" ? <PlayableCardArt prompt={quote.content.data} poster={poster} /> : <OutputPosterPreview media={poster} />
    ) : summary.media.length > 0 ? (
      <OutputThumbnailStrip media={summary.media} />
    ) : (
      <SummaryTextArt summary={summary} seed={quote.id} />
    )
  ) : skill ? (
    <p data-quote-skill-art="" className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 bg-surface-soft px-4 text-center">
      <GraduationCap size={32} aria-hidden className="text-text-muted" />
      <span className="line-clamp-3 break-words text-small text-text-secondary">{skill.summary}</span>
    </p>
  ) : null;

  return (
    <ContentCard variant="box" href={href} className="gap-3 p-4">
      {/* Alıntılayan: ad profile gider, zaman alıntının kendi sayfasına (klavye için gerçek bağlantı); ⋮ menüsü yalnız alıntı işlerini taşır. */}
      <div className="flex items-center gap-3">
        <Link href={profileHref(quote.author)} className="relative z-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={quote.author.displayName}>
          <Avatar src={quote.author.avatarUrl} alt="" size={32} />
        </Link>
        <p className="min-w-0 flex-1 text-small leading-snug text-text">
          <Link href={profileHref(quote.author)} className="relative z-10 font-semibold hover:underline">
            {quote.author.displayName}
          </Link>{" "}
          <span className="text-text-muted">{t(quoteVerbKey(quote))}</span>
          <span className="block text-caption text-text-muted">
            <Link href={href} data-card-link className="relative z-10 rounded-xs outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary">
              {formatRelativeTime(quote.createdAt, language)}
            </Link>
          </span>
        </p>
        <div className="relative z-20 -mr-1.5 shrink-0 focus-within:z-30">
          <QuoteMenu quote={quote} onDeleted={() => setGone(true)} />
        </div>
      </div>

      {quote.note && (
        <p data-quote-note className="whitespace-pre-wrap break-words text-body text-text">
          {quote.note}
        </p>
      )}

      {/* Alıntılanan içerik: kendi bağlantısı + ORİJİNAL yazar (uzanan bağlantı en sonda, kontroller z-10). */}
      {art && originalHref ? (
        <div data-quote-original-card className="card-flat relative z-10 overflow-hidden rounded-md">
          <div data-card-media className="relative overflow-hidden bg-primary-soft">
            {art}
            <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-2 space-y-1 art-scrim px-3 pb-2.5 pt-8 [&_a]:pointer-events-auto", titleInArt && "sr-only")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {skill ? <ContentTypePill icon={GraduationCap} label={t("skill.singular")} detail={null} /> : summary && <ContentTypePill icon={summary.typeIcon} label={t(summary.typeLabelKey)} detail={summary.tools.length > 0 ? null : summary.detail} />}
              </div>
              <h3 className="font-display text-h3 font-extrabold leading-[1.1] tracking-[-0.02em] text-on-art">
                <Link href={originalHref} className="relative z-10 rounded-xs outline-none decoration-primary/40 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-primary">
                  {title}
                </Link>
              </h3>
            </div>
          </div>
          {summary?.palette && summary.palette.length > 0 && <PaletteStrip colors={summary.palette} className="h-1.5" />}
          <div className="relative flex items-center gap-2 border-t border-border-soft px-3 py-2">
            {originalAuthor ? (
              <Link href={profileHref(originalAuthor)} data-quote-original-author className="relative z-10 flex min-w-0 items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Avatar src={originalAuthor.avatarUrl} alt="" size={20} className="shrink-0" />
                <span className="min-w-0 truncate text-caption font-semibold text-text hover:text-primary">{originalName}</span>
              </Link>
            ) : (
              <span data-quote-original-author className="flex min-w-0 items-center gap-2">
                <Avatar src={null} alt="" size={20} className="shrink-0" />
                <span className="min-w-0 truncate text-caption font-semibold text-text">{originalName}</span>
              </span>
            )}
          </div>
          <Link href={originalHref} data-quote-original-link aria-hidden tabIndex={-1} className="absolute inset-0 z-0" />
        </div>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-md bg-surface-soft px-3 py-6 text-small text-text-muted">
          <EyeOff size={16} aria-hidden /> {t("quotes.card.contentGone")}
        </p>
      )}

      {/* `contents`: the buttons stay direct items of the shared action row; the wrapper only marks them as the QUOTE's own counters. */}
      <div data-card-actions className="relative z-10 -ml-1.5 flex items-center">
        <div className="contents" data-quote-engagement={quote.id}>
          <QuoteLike quote={quote} />
          <QuoteCommentLink quote={quote} />
        </div>
      </div>
    </ContentCard>
  );
}
