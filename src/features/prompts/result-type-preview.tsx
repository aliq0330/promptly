"use client";

import Image from "next/image";
import { FileText, Play } from "lucide-react";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { cn } from "@/lib/utils";
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
export function ResultTypePreview({ result, size }: { result: PreviewableResult; size: "card" | "detail" }) {
  if (result.mediaType === "image") {
    if (size === "detail" && result.mediaUrl) {
      const ratio = result.width && result.height ? clampedAspectRatio(result.width, result.height) : 1;
      return (
        <div
          className="relative mx-auto w-full overflow-hidden rounded-lg bg-surface-soft"
          style={{ aspectRatio: ratio, maxWidth: `${Math.round(560 * ratio)}px` }}
        >
          <Image src={result.mediaUrl} alt="" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-contain" />
        </div>
      );
    }
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-surface-soft">
        {result.thumbnailUrl && (
          <Image src={result.thumbnailUrl} alt="" fill sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
        )}
      </div>
    );
  }

  if (result.mediaType === "video") {
    if (size === "detail" && result.mediaUrl) {
      return (
        <video
          controls
          poster={result.thumbnailUrl ?? undefined}
          src={result.mediaUrl}
          className="mx-auto max-h-[70vh] w-full rounded-lg bg-black"
        />
      );
    }
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-surface-soft">
        {result.thumbnailUrl && (
          <Image src={result.thumbnailUrl} alt="" fill sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
            <Play size={16} fill="currentColor" />
          </span>
        </span>
      </div>
    );
  }

  if (result.mediaType === "audio") {
    if (size === "detail" && result.mediaUrl) {
      return (
        <div className="mx-auto w-full max-w-xs space-y-3">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-surface-soft">
            {result.thumbnailUrl && <Image src={result.thumbnailUrl} alt="" fill sizes="320px" className="object-cover" />}
          </div>
          <audio controls src={result.mediaUrl} className="w-full" />
        </div>
      );
    }
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-surface-soft">
        {result.thumbnailUrl && (
          <Image src={result.thumbnailUrl} alt="" fill sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
            <Play size={16} fill="currentColor" />
          </span>
        </span>
      </div>
    );
  }

  // text / other
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 bg-surface-soft",
        size === "card" ? "aspect-square w-full p-3" : "w-full rounded-lg border border-border-soft p-4",
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
