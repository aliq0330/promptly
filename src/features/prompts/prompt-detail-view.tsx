"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { GeneratorSourceContext, RequestResponseContext } from "@/features/prompts/post-context";
import { CommentSection } from "@/features/prompts/comment-section";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { PersonalizeModal } from "@/features/prompts/personalize-modal";
import { EditHistoryPanel } from "@/features/prompts/edit-history-panel";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { PostMenu } from "@/features/prompts/post-menu";
import { parseHighlightValue } from "@/lib/notification-utils";
import { cn, formatRelativeTime, tagHref } from "@/lib/utils";
import type { Prompt, PromptVariable } from "@/types";

/** Same fade timing as the comment-thread flash (`comment-section.tsx`) — one shared "how long does a jumped-to thing glow" feel across the app. */
const HIGHLIGHT_DURATION_MS = 2500;

/** The real prompt detail rendering, used by `/prompts/local?id=…`. */
export function PromptDetailView({ prompt }: { prompt: Prompt }) {
  const media = prompt.media[0];
  const typeMeta = CONTENT_TYPE_META[prompt.contentType];
  const TypeIcon = typeMeta.icon;

  const { user } = useAuth();
  const isOwn = user?.id === prompt.author.id;
  const [variables, setVariables] = useState<PromptVariable[]>([]);
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false);

  const searchParams = useSearchParams();
  const highlight = parseHighlightValue(searchParams.get("hl"));
  const highlightCommentId = highlight?.kind === "comment" ? highlight.id : null;
  // A "gönderi beğenisi" notification points at the post itself (Aşama
  // 4.1) — there's nothing to scroll to (it's already the page's main
  // content), just a brief flash to confirm this is the right one.
  const [isPostFlashed, setIsPostFlashed] = useState(highlight?.kind === "post" && highlight.id === prompt.id);

  useEffect(() => {
    if (!isPostFlashed) return;
    const timer = setTimeout(() => setIsPostFlashed(false), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever fires once, on mount, for the initial flash
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchVariablesForPrompt(prompt.id).then((result) => {
      if (!cancelled) setVariables(result);
    });
    return () => {
      cancelled = true;
    };
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
            <PostMenu promptId={prompt.id} authorId={prompt.author.id} />
          </div>
        </div>

        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}
        {prompt.generatedFrom && <GeneratorSourceContext generatedFrom={prompt.generatedFrom} />}

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
            <Link key={tag.slug} href={tagHref(tag)}>
              <Badge className="hover:bg-accent-surface">{tag.label}</Badge>
            </Link>
          ))}
          {prompt.tool && <Badge variant="outline">{prompt.tool}</Badge>}
        </div>

        <div className="rounded-md border border-border bg-surface p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Prompt Metni</p>
            <CopyPromptButton text={prompt.promptText} />
          </div>
          <p className="font-mono text-sm text-text">{prompt.promptText}</p>
          {variables.length > 0 && (
            <button
              type="button"
              onClick={() => setIsPersonalizeOpen(true)}
              className="relative z-10 mt-3 flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Wand2 size={13} />
              Promptu kişiselleştir
            </button>
          )}
        </div>

        {isOwn && <EditHistoryPanel contentType="prompt" contentId={prompt.id} />}

        <div className="flex items-center gap-5 pt-1 text-sm text-text-muted">
          <LikeButton id={prompt.id} likeCount={prompt.likeCount} size={18} className="text-sm" />
          <CommentCountLink
            promptId={prompt.id}
            baseCount={prompt.commentCount}
            size={18}
            className="text-sm"
          />
          <SaveButton promptId={prompt.id} size={18} />
        </div>
      </div>

      <section className="space-y-3 border-t border-border pt-5">
        <CommentSection target={{ promptId: prompt.id }} highlightCommentId={highlightCommentId} />
      </section>

      {isPersonalizeOpen && (
        <PersonalizeModal
          promptText={prompt.promptText}
          variables={variables}
          onClose={() => setIsPersonalizeOpen(false)}
        />
      )}
    </div>
  );
}
