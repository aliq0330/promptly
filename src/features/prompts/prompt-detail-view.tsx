"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { PenLine, SquareTerminal, Wand2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { RelatedPrompts } from "@/features/prompts/related-prompts";
import { CreatorSummary } from "@/features/profile/creator-summary";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { GeneratorSourceContext, RequestResponseContext } from "@/features/prompts/post-context";
import { CommentSection } from "@/features/prompts/comment-section";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { PersonalizeModal } from "@/features/prompts/personalize-modal";
import { EditHistoryPanel } from "@/features/prompts/edit-history-panel";
import { SuggestEditModal } from "@/features/prompts/suggest-edit-modal";
import { EditSuggestionsPanel } from "@/features/prompts/edit-suggestions-panel";
import { PromptHistoryPanel } from "@/features/prompts/prompt-history-panel";
import { ContributorsPanel } from "@/features/prompts/contributors-panel";
import { PromptResultsSection } from "@/features/prompts/prompt-results-section";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { PostMenu } from "@/features/prompts/post-menu";
import { parseHighlightValue } from "@/lib/notification-utils";
import { cn, formatRelativeTime, profileHref, tagHref } from "@/lib/utils";
import type { Prompt, PromptVariable } from "@/types";

/** Same fade timing as the comment-thread flash (`comment-section.tsx`) — one shared "how long does a jumped-to thing glow" feel across the app. */
const HIGHLIGHT_DURATION_MS = 2500;

/** The real prompt detail rendering, used by `/prompts/local?id=…`. */
export function PromptDetailView({ prompt }: { prompt: Prompt }) {
  const media = prompt.media[0];
  const typeMeta = CONTENT_TYPE_META[prompt.contentType];

  const { user } = useAuth();
  const isOwn = user?.id === prompt.author.id;
  const [variables, setVariables] = useState<PromptVariable[]>([]);
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false);
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
  // The prompt's own display text, lifted into local state so accepting a
  // real edit suggestion (Düzenleme Önerisi modülü) updates the page
  // instantly — `prompt` itself is a prop from a parent that only refetches
  // on its own next navigation, never this exact instance.
  const [livePromptText, setLivePromptText] = useState(prompt.promptText);
  // Bumped whenever the owner accepts a suggestion this session — forces
  // `ContributorsPanel` to remount and refetch so a brand-new contributor
  // shows up immediately, without a page reload.
  const [contributorsRefreshKey, setContributorsRefreshKey] = useState(0);

  const searchParams = useSearchParams();
  const highlight = parseHighlightValue(searchParams.get("hl"));
  const highlightCommentId = highlight?.kind === "comment" ? highlight.id : null;
  const highlightSuggestionId = highlight?.kind === "suggestion" ? highlight.id : null;
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
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <article
          className={cn(
            "min-w-0 space-y-5 rounded-lg transition-colors duration-700",
            isPostFlashed && "bg-primary/10 ring-1 ring-primary/40",
          )}
        >
          <header className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <ContentTypeLabel icon={typeMeta.icon} label={`${typeMeta.label} Prompt`} detail={prompt.tool} />
              <PostMenu promptId={prompt.id} authorId={prompt.author.id} />
            </div>
            <h1 className="text-h1 font-semibold text-text">{prompt.title}</h1>
            {prompt.description && <p className="max-w-2xl text-body text-text-secondary">{prompt.description}</p>}
            <Link href={profileHref(prompt.author)} className="group inline-flex items-center gap-2.5 rounded-md">
              <Avatar src={prompt.author.avatarUrl} alt={prompt.author.displayName} size={32} />
              <span className="leading-tight">
                <span className="block text-label font-semibold text-text group-hover:text-primary">{prompt.author.displayName}</span>
                <span className="block text-caption text-text-muted">
                  @{prompt.author.username} · {formatRelativeTime(prompt.createdAt)}
                </span>
              </span>
            </Link>
          </header>

          {prompt.origin.type === "request-response" && (
            <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
          )}
          {prompt.generatedFrom && <GeneratorSourceContext generatedFrom={prompt.generatedFrom} />}

          <div className="flex flex-wrap items-center gap-0.5 border-y border-border-soft py-1.5">
            <LikeButton id={prompt.id} likeCount={prompt.likeCount} size={18} />
            <CommentCountLink promptId={prompt.id} baseCount={prompt.commentCount} size={18} />
            <SaveButton promptId={prompt.id} size={18} />
            <span className="ml-auto" />
            <ShareTriggerButton target={{ contentType: "prompt", prompt }} label="Paylaş" />
          </div>

          <section aria-labelledby="prompt-text-title" className="overflow-hidden rounded-lg border border-border-soft bg-surface-soft">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft px-4 py-2.5">
              <h2 id="prompt-text-title" className="flex items-center gap-1.5 font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                <SquareTerminal size={14} />
                Prompt Metni
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {user && !isOwn && (
                  <button
                    type="button"
                    onClick={() => setIsSuggestModalOpen(true)}
                    className="relative z-10 inline-flex h-9 items-center gap-1.5 rounded-sm border border-primary/30 bg-primary-soft px-3 text-label font-medium text-primary transition-colors hover:border-primary/60"
                  >
                    <PenLine size={14} />
                    Düzenleme öner
                  </button>
                )}
                {variables.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsPersonalizeOpen(true)}
                    className="relative z-10 inline-flex h-9 items-center gap-1.5 rounded-sm border border-primary/30 bg-primary-soft px-3 text-label font-medium text-primary transition-colors hover:border-primary/60"
                  >
                    <Wand2 size={14} />
                    Promptu kişiselleştir
                  </button>
                )}
                <CopyPromptButton text={livePromptText} size="md" />
              </div>
            </div>
            <p className="prompt-text whitespace-pre-wrap break-words px-4 py-4 text-[0.875rem] text-text">{livePromptText}</p>
          </section>

          {media && (
            <figure className="space-y-2">
              <div
                className="relative w-full overflow-hidden rounded-lg border border-border-soft bg-surface-soft"
                // Supporting output preview, not a hero image: capped at ~480px tall.
                style={{
                  aspectRatio: clampedAspectRatio(media.width, media.height),
                  maxWidth: `${Math.round(480 * clampedAspectRatio(media.width, media.height))}px`,
                }}
              >
                <Image src={media.url} alt={media.alt} fill sizes="(min-width: 1024px) 720px, 100vw" className="object-cover" />
              </div>
              <figcaption className="text-caption text-text-muted">Çıktı — bu promptla üretilen sonuç</figcaption>
            </figure>
          )}

          {prompt.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {prompt.tags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={tagHref(tag)}
                  className="inline-flex h-7 items-center rounded-full border border-border-soft bg-surface px-2.5 text-caption font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                >
                  #{tag.label}
                </Link>
              ))}
            </div>
          )}

          <PromptResultsSection promptId={prompt.id} promptText={livePromptText} />

          {isOwn && (
            <EditSuggestionsPanel
              promptId={prompt.id}
              currentPromptText={livePromptText}
              highlightSuggestionId={highlightSuggestionId}
              onAccepted={(newPromptText) => {
                setLivePromptText(newPromptText);
                setContributorsRefreshKey((prev) => prev + 1);
              }}
            />
          )}

          <PromptHistoryPanel promptId={prompt.id} />

          {isOwn && <EditHistoryPanel contentType="prompt" contentId={prompt.id} />}

          <section id="comments" className="scroll-mt-20 rounded-lg border border-border-soft bg-surface p-4 sm:p-5">
            <CommentSection target={{ promptId: prompt.id }} highlightCommentId={highlightCommentId} />
          </section>
        </article>

        <aside className="mt-6 space-y-5 lg:sticky lg:top-24 lg:mt-0 lg:self-start">
          <CreatorSummary creator={prompt.author} isOwn={isOwn} />
          <ContributorsPanel key={contributorsRefreshKey} promptId={prompt.id} />
          <RelatedPrompts prompt={prompt} />
        </aside>
      </div>

      {isPersonalizeOpen && (
        <PersonalizeModal
          promptText={livePromptText}
          variables={variables}
          onClose={() => setIsPersonalizeOpen(false)}
        />
      )}

      {isSuggestModalOpen && user && (
        <SuggestEditModal
          promptId={prompt.id}
          proposerId={user.id}
          promptText={livePromptText}
          onClose={() => setIsSuggestModalOpen(false)}
        />
      )}
    </div>
  );
}
