"use client";

import { FileText, Music, Video } from "lucide-react";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { cn } from "@/lib/utils";
import { StorageAudio, StorageImage, StorageVideo } from "@/components/ui/storage-media";
import type { PromptResult, PromptResultSummary } from "@/types";

type PreviewableResult = PromptResultSummary & Partial<Pick<PromptResult, "mediaUrl" | "width" | "height">>;

/**
 * The one place that decides "what does a result of this media type actually
 * look like" — shared by the compact card (`size="card"`) and the big
 * detail viewer (`size="detail"`), so the type-branching logic (image vs.
 * video vs. audio vs. text) exists exactly once, per CLAUDE.md §24/§27's
 * "aynı işi yapan ikinci bir component oluşturma" rule.
 *
 * A card only ever gets a `PromptResultSummary` (no `mediaUrl` — CLAUDE.md
 * §16's lazy-loading rule, the grid never fetches full media), so it always
 * shows a thumbnail/poster/placeholder, never a real `<video>`/`<audio>`
 * element. Only the detail page passes the full `PromptResult` (with
 * `mediaUrl` set), which is when a real player actually renders.
 */
/** A card's media-kind mark (docs/history/281-*): a small translucent disc in the top-right corner instead of a play button over the picture. */
function MediaBadge({ icon: Icon }: { icon: typeof Video }) {
  return (
    <span aria-hidden className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white">
      <Icon size={14} />
    </span>
  );
}

export function ResultTypePreview({ result, size }: { result: PreviewableResult; size: "card" | "detail" }) {
  if (result.mediaType === "image") {
    if (size === "detail" && result.mediaUrl) {
      const ratio = result.width && result.height ? clampedAspectRatio(result.width, result.height) : 1;
      return (
        <div
          className="relative mx-auto w-full overflow-hidden rounded-lg bg-surface-soft"
          style={{ aspectRatio: ratio, maxWidth: `${Math.round(560 * ratio)}px` }}
        >
          <StorageImage src={result.mediaUrl} alt="" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-contain" />
        </div>
      );
    }
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-surface-soft">
        {result.thumbnailUrl && (
          <StorageImage src={result.thumbnailUrl} alt="" fill sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
        )}
      </div>
    );
  }

  if (result.mediaType === "video") {
    if (size === "detail" && result.mediaUrl) {
      return (
        <StorageVideo
          controls
          playsInline
          preload="metadata"
          poster={result.thumbnailUrl ?? undefined}
          src={result.mediaUrl}
          className="mx-auto max-h-[70vh] w-full rounded-lg bg-black"
        />
      );
    }
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-surface-soft">
        {result.thumbnailUrl && (
          <StorageImage src={result.thumbnailUrl} alt="" fill sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
        )}
        <MediaBadge icon={Video} />
      </div>
    );
  }

  if (result.mediaType === "audio") {
    if (size === "detail" && result.mediaUrl) {
      return (
        <div className="mx-auto w-full max-w-xs space-y-3">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-surface-soft">
            {result.thumbnailUrl && <StorageImage src={result.thumbnailUrl} alt="" fill sizes="320px" className="object-cover" />}
          </div>
          <StorageAudio controls preload="metadata" src={result.mediaUrl} className="w-full" />
        </div>
      );
    }
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-surface-soft">
        {result.thumbnailUrl && (
          <StorageImage src={result.thumbnailUrl} alt="" fill sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
        )}
        <MediaBadge icon={Music} />
      </div>
    );
  }

  // text / other
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 bg-surface-soft",
        size === "card" ? "aspect-square w-full p-3 pb-14" : "w-full rounded-lg border border-border-soft p-4",
      )}
    >
      <FileText size={size === "card" ? 15 : 18} className="shrink-0 text-text-muted" />
      <p
        className={cn(
          "prompt-text whitespace-pre-wrap break-words text-text-secondary",
          size === "card" ? "line-clamp-5 text-[0.7rem]" : "max-h-[60vh] overflow-y-auto text-sm text-text",
        )}
      >
        {result.textContent}
      </p>
    </div>
  );
}
