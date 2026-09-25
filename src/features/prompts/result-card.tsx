"use client";

import Link from "next/link";
import { PencilLine } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LikeButton } from "@/features/prompts/like-button";
import { ResultTypePreview } from "@/features/prompts/result-type-preview";
import { formatRelativeTime, profileHref, resultHref } from "@/lib/utils";
import type { PromptResultSummary } from "@/types";

/**
 * One compact "Kullanıcı Sonucu" card — CLAUDE.md §1/§6/§25's kompakt kart:
 * thumbnail/preview, creator avatar+name+time, tool badge, "N değişiklik"
 * badge (only when the sharer actually changed the prompt), and a real,
 * interactive like count (same `LikeButton`/`contentType="prompt_result"`
 * every other card type already uses — no second like system). Deliberately
 * shows nothing else (no comment count, no full modification detail) — the
 * card stays small, everything else lives on the result's own detail page.
 * A stretched `<Link>` (not the shared `ContentCard` shell, whose hover/
 * shadow treatment is tuned for a full-width post, not a small square tile)
 * takes the whole card to `resultHref`, with the avatar link and like
 * button as independently-clickable `relative z-10` islands on top of it.
 *
 * The `<Link>` is rendered LAST, not first, even though it's `z-0` — CSS
 * paints same-tier positioned siblings (z-index:0/auto) in DOM order, so a
 * z-0 element placed BEFORE the preview would end up painted (and hit-
 * tested) UNDER it, silently swallowing clicks on the image/video/audio
 * preview (`ContentCard`, the shared shell every other card type uses,
 * gets this right the same way — its own stretched link is the last
 * child too).
 */
export function ResultCard({ result }: { result: PromptResultSummary }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border-soft bg-surface transition-[border-color,box-shadow] duration-200 ease-soft hover:border-border hover:shadow-card-hover">
      <ResultTypePreview result={result} size="card" />
      <div className="flex flex-col gap-1.5 p-2.5">
        <Link href={profileHref(result.creator)} className="relative z-10 flex min-w-0 items-center gap-1.5">
          <Avatar src={result.creator.avatarUrl} alt={result.creator.displayName} size={20} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-caption font-medium text-text hover:text-primary">
              @{result.creator.username}
            </span>
            <span className="block truncate text-[0.65rem] text-text-muted">{formatRelativeTime(result.createdAt)}</span>
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          {result.tool && (
            <Badge variant="neutral" className="max-w-full truncate">
              {result.tool}
            </Badge>
          )}
          {result.hasModification && (
            <Badge variant="outline" className="gap-0.5">
              <PencilLine size={10} />
              Değişiklik
            </Badge>
          )}
        </div>
        <div className="relative z-10">
          <LikeButton id={result.id} likeCount={result.likeCount} contentType="prompt_result" size={14} />
        </div>
      </div>
      <Link href={resultHref(result)} className="absolute inset-0 z-0" aria-label={`${result.creator.displayName} sonucu`} />
    </div>
  );
}
