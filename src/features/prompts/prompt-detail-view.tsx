"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { RemixContext, RequestResponseContext } from "@/features/prompts/post-context";
import { CommentSection } from "@/features/prompts/comment-section";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { fetchRemixChain, fetchRemixesOf } from "@/lib/supabase/prompts";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { PostMenu } from "@/features/prompts/post-menu";
import { parseHighlightValue } from "@/lib/notification-utils";
import { cn, formatCount, formatRelativeTime, promptHref } from "@/lib/utils";
import type { Prompt } from "@/types";

/** Same fade timing as the comment-thread flash (`comment-section.tsx`) — one shared "how long does a jumped-to thing glow" feel across the app. */
const HIGHLIGHT_DURATION_MS = 2500;

/** The real prompt detail rendering, used by `/prompts/local?id=…`. */
export function PromptDetailView({ prompt }: { prompt: Prompt }) {
  const media = prompt.media[0];
  const typeMeta = CONTENT_TYPE_META[prompt.contentType];
  const TypeIcon = typeMeta.icon;

  const [remixes, setRemixes] = useState<Prompt[]>([]);
  const [remixChain, setRemixChain] = useState<Prompt[]>([prompt]);

  const searchParams = useSearchParams();
  const highlight = parseHighlightValue(searchParams.get("hl"));
  const highlightCommentId = highlight?.kind === "comment" ? highlight.id : null;
  // A "gönderi beğenisi"/"remix" notification points at the post itself
  // (Aşama 4.1/4.5) — there's nothing to scroll to (it's already the page's
  // main content), just a brief flash to confirm this is the right one.
  const [isPostFlashed, setIsPostFlashed] = useState(highlight?.kind === "post" && highlight.id === prompt.id);

  useEffect(() => {
    if (!isPostFlashed) return;
    const timer = setTimeout(() => setIsPostFlashed(false), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever fires once, on mount, for the initial flash
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRemixesOf(prompt.id).then((result) => {
      if (!cancelled) setRemixes(result);
    });
    fetchRemixChain(prompt).then((chain) => {
      if (!cancelled) setRemixChain(chain);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.id]);

  return (
    <div
      className={cn(
        "mx-auto max-w-3xl space-y-6 px-4 py-6 transition-colors duration-700 lg:px-6",
        isPostFlashed && "rounded-lg bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      {media && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-accent-surface">
          <Image src={media.url} alt={media.alt} fill sizes="768px" className="object-cover" />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-primary">
          <TypeIcon size={14} />
          <span className="text-xs font-medium">{typeMeta.label} Prompt</span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text">{prompt.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            {prompt.origin.type === "remix" && <Badge>Remix</Badge>}
            <PostMenu promptId={prompt.id} authorId={prompt.author.id} />
          </div>
        </div>

        {prompt.origin.type === "remix" && <RemixContext sourcePromptId={prompt.origin.sourcePromptId} />}
        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}

        {remixChain.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
            <span className="font-medium text-text">Remix zinciri:</span>
            {remixChain.map((node, index) => {
              const label = node.deletedAt ? "Silinmiş paylaşım" : node.title;
              return (
                <span key={node.id} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight size={12} className="shrink-0" />}
                  {node.id === prompt.id ? (
                    <span className="font-medium text-text">{label}</span>
                  ) : (
                    <Link href={promptHref(node)} className="text-primary hover:underline">
                      {label}
                    </Link>
                  )}
                </span>
              );
            })}
          </div>
        )}

        <p className="text-sm text-text-muted">{prompt.description}</p>

        <div className="flex items-center gap-2">
          <Avatar src={prompt.author.avatarUrl} alt={prompt.author.displayName} size={32} />
          <div className="text-sm">
            <p className="font-medium text-text">{prompt.author.displayName}</p>
            <p className="text-xs text-text-muted">{formatRelativeTime(prompt.createdAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {prompt.tags.map((tag) => (
            <Badge key={tag.slug}>{tag.label}</Badge>
          ))}
          {prompt.tool && <Badge variant="outline">{prompt.tool}</Badge>}
        </div>

        <div className="rounded-md border border-border bg-surface p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Prompt Metni
          </p>
          <p className="font-mono text-sm text-text">{prompt.promptText}</p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-5 text-sm text-text-muted">
            <LikeButton id={prompt.id} likeCount={prompt.likeCount} size={18} className="text-sm" />
            <CommentCountLink
              promptId={prompt.id}
              baseCount={prompt.commentCount}
              size={18}
              className="text-sm"
            />
            <span className="flex items-center gap-1.5">
              <Repeat2 size={18} />
              {formatCount(prompt.remixCount)}
            </span>
            <SaveButton promptId={prompt.id} size={18} />
          </div>
          <Link
            href={`/create?remix=${prompt.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-text transition-colors hover:bg-accent-surface"
          >
            <Repeat2 size={14} />
            Remixle
          </Link>
        </div>
      </div>

      <section className="space-y-3 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-text">Remixler ({remixes.length})</h2>
        {remixes.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Bu prompt henüz remixlenmedi.
          </p>
        ) : (
          <PromptGrid prompts={remixes} />
        )}
      </section>

      <CommentSection target={{ promptId: prompt.id }} highlightCommentId={highlightCommentId} />
    </div>
  );
}
