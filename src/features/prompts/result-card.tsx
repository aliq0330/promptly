"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { LikeButton } from "@/features/prompts/like-button";
import { ResultTypePreview } from "@/features/prompts/result-type-preview";
import { profileHref, resultHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptResultSummary } from "@/types";

/**
 * One compact "Kullanıcı Sonucu" card (docs/history/281-*, kullanıcı mockup'ı): just the picture — bottom-left the creator (avatar + @name),
 * bottom-right the reaction button (the same `LikeButton`/`contentType="prompt_result"` every card uses, as a translucent pill). The tool,
 * the "N değişiklik" mark and the time live on the result's own page. A stretched `<Link>` takes the whole card to `resultHref`, with the
 * creator link and the reaction button as independently-clickable `relative z-10` islands on top of it.
 *
 * The `<Link>` is rendered LAST, not first, even though it's `z-0` — CSS paints same-tier positioned siblings (z-index:0/auto) in DOM
 * order, so a z-0 element placed BEFORE the preview would end up painted (and hit-tested) UNDER it, silently swallowing clicks on the
 * image/video/audio preview (`ContentCard`, the shared shell every other card type uses, gets this right the same way).
 */
export function ResultCard({ result }: { result: PromptResultSummary }) {
  const { t } = useTranslation();
  return (
    <div className="group relative overflow-hidden rounded-xl bg-surface-soft">
      <ResultTypePreview result={result} size="card" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-1.5">
        <Link href={profileHref(result.creator)} className="relative z-10 flex min-w-0 items-center gap-1.5 text-label font-semibold text-white">
          <Avatar src={result.creator.avatarUrl} alt={result.creator.displayName} size={24} className="ring-2 ring-white/80" />
          <span className="truncate">@{result.creator.username}</span>
        </Link>
        <LikeButton id={result.id} likeCount={result.likeCount} contentType="prompt_result" size={18} tone="overlay" />
      </div>
      <Link href={resultHref(result)} className="absolute inset-0 z-0" aria-label={t("result.cardAriaLabel", { name: result.creator.displayName })} />
    </div>
  );
}
