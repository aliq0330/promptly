"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { RemixSourceLink } from "@/features/prompts/remix-source-link";
import { CommentSection } from "@/features/prompts/comment-section";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { fetchRemixChain, fetchRemixesOf } from "@/lib/supabase/prompts";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { formatCount, formatRelativeTime, promptHref } from "@/lib/utils";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import type { Prompt } from "@/types";

/** The real prompt detail rendering, used by `/prompts/local?id=…`. */
export function PromptDetailView({ prompt }: { prompt: Prompt }) {
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();
  const media = prompt.media[0];
  const typeMeta = CONTENT_TYPE_META[prompt.contentType];
  const TypeIcon = typeMeta.icon;

  const [remixes, setRemixes] = useState<Prompt[]>([]);
  const [remixChain, setRemixChain] = useState<Prompt[]>([prompt]);
  const [isSelectedAnswer, setIsSelectedAnswer] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    if (prompt.origin.type !== "request-response") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- not an answer to any request, nothing to check
      setIsSelectedAnswer(false);
      return;
    }
    const requestId = prompt.origin.requestId;
    const cached = getCachedRequest(requestId);
    if (cached) {
      setIsSelectedAnswer(cached.selectedResponsePromptId === prompt.id);
      return;
    }
    fetchRequestById(requestId).then((request) => {
      if (!cancelled) setIsSelectedAnswer(request?.selectedResponsePromptId === prompt.id);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.id, prompt.origin]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-6">
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
          {prompt.origin.type === "remix" && <Badge>Remix</Badge>}
        </div>

        {prompt.origin.type !== "original" && <RemixSourceLink origin={prompt.origin} />}
        {isSelectedAnswer && (
          <Badge variant="accent" className="w-fit">
            Bu yanıt seçildi
          </Badge>
        )}

        {remixChain.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
            <span className="font-medium text-text">Remix zinciri:</span>
            {remixChain.map((node, index) => (
              <span key={node.id} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={12} className="shrink-0" />}
                {node.id === prompt.id ? (
                  <span className="font-medium text-text">{node.title}</span>
                ) : (
                  <Link href={promptHref(node)} className="text-primary hover:underline">
                    {node.title}
                  </Link>
                )}
              </span>
            ))}
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

      <CommentSection target={{ promptId: prompt.id }} />
    </div>
  );
}
