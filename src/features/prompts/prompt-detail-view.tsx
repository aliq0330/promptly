"use client";

import { usePageTitle } from "@/components/layout/page-title";
import { RunButton } from "@/features/content/run-with-ai";
import { ToolLine } from "@/features/content/tool-chips";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PenLine, SquareTerminal } from "lucide-react";
import { OpenInStudioButton } from "@/features/studio/open-in-studio-button";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { RelatedPrompts } from "@/features/prompts/related-prompts";
import { TaxonomyLinks } from "@/features/content/taxonomy-links";
import { CreatorSummary } from "@/features/profile/creator-summary";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { RequestResponseContext } from "@/features/prompts/post-context";
import { CommentSection } from "@/features/prompts/comment-section";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { RelationMapLink } from "@/features/relations/relation-map-link";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { PromptDnaDisplay } from "@/features/prompts/prompt-dna-display";
import { PromptVariableInputs } from "@/features/prompts/prompt-variable-inputs";
import { EditHistoryPanel } from "@/features/prompts/edit-history-panel";
import { SuggestEditModal } from "@/features/prompts/suggest-edit-modal";
import { EditSuggestionsPanel } from "@/features/prompts/edit-suggestions-panel";
import { PromptHistoryPanel } from "@/features/prompts/prompt-history-panel";
import { ContributorsPanel } from "@/features/prompts/contributors-panel";
import { PromptResultsSection } from "@/features/prompts/prompt-results-section";
import { PromptPlayableOutput } from "@/features/prompts/prompt-playable-output";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { resolvePromptText } from "@/lib/prompt-variables";
import { AssembleStatus, AssembleSweep, AssembledPromptText, useAssembleProgress } from "@/features/prompts/prompt-assemble";
import { hasPendingCardTransition, useCardMediaTransition } from "@/lib/card-transition";
import { effectiveVariableValues } from "@/lib/prompt-variable-types";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { PostMenu } from "@/features/prompts/post-menu";
import { parseHighlightValue } from "@/lib/notification-utils";
import { cn, promptHref, relationMapHref } from "@/lib/utils";
import { splitSourceNotes } from "@/lib/source-notes";
import { SourceNotes } from "@/features/content/source-notes";
import { FollowButton } from "@/features/profile/follow-button";
import { DetailActionBar, DetailAside, DetailByline, DetailComments, DetailLede, DetailShell, DetailTags, DetailTitle, Eyebrow } from "@/features/content/detail-parts";
import { ReferenceRequirementNotes } from "@/features/content/reference-requirements";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Prompt, PromptVariable, PromptVersion } from "@/types";
import type { DnaSection } from "@/lib/prompt-dna/types";
import { fetchDnaSections } from "@/lib/supabase/prompt-dna";
import { fetchVersionsForPrompt } from "@/lib/supabase/prompt-versions";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { ScrollablePrompt } from "@/features/content/scrollable-prompt";
import { StorageImage, StorageImg } from "@/components/ui/storage-media";

type PromptTab = "prompt" | "history" | "dna";

/** Same fade timing as the comment-thread flash (`comment-section.tsx`) — one shared "how long does a jumped-to thing glow" feel across the app. */
const HIGHLIGHT_DURATION_MS = 2500;

/** The real prompt detail rendering, used by `/prompts/local?id=…`. */
export function PromptDetailView({ prompt }: { prompt: Prompt }) {
  const { t, language } = useTranslation();
  usePageTitle(prompt.title);
  const media = prompt.media[0];
  // Credit lines ("Kaynak: …") are shown as a muted note, not as description.
  const { body: descriptionBody, notes: sourceNotes } = useMemo(() => splitSourceNotes(prompt.description), [prompt.description]);
  const typeMeta = CONTENT_TYPE_META[prompt.contentType];
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Arrived from a card with a cover → that cover morphs into this hero (src/lib/card-transition.ts).
  const selfHref = promptHref(prompt);
  const [morphingCover] = useState(() => hasPendingCardTransition(selfHref));
  const heroRef = useCardMediaTransition<HTMLButtonElement>(selfHref);

  const { user } = useAuth();
  const isOwn = user?.id === prompt.author.id;
  const [variables, setVariables] = useState<PromptVariable[]>([]);
  // Viewer-typed overrides per variable name; anything not typed falls back to the default.
  const [variableOverrides, setVariableOverrides] = useState<Record<string, string>>({});
  const [dnaSections, setDnaSections] = useState<DnaSection[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [activeTab, setActiveTab] = useState<PromptTab>("prompt");
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

  // Defaults + the viewer's own choices, with conditional variables that are currently hidden resolved to "".
  const { values: variableValues, visible: variableVisible } = useMemo(
    () => effectiveVariableValues(variables, variableOverrides),
    [variables, variableOverrides],
  );
  const isCustomized = variables.some((variable) => variable.name in variableOverrides && variableOverrides[variable.name] !== variable.defaultValue);
  // What the viewer sees, copies and runs: the template with their values substituted.
  const displayText = variables.length > 0 ? resolvePromptText(livePromptText, variableValues) : livePromptText;
  const assemble = useAssembleProgress(variables, variableValues, variableVisible);

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
    fetchDnaSections(prompt.id).then((result) => {
      if (!cancelled) setDnaSections(result);
    });
    fetchVersionsForPrompt(prompt.id).then((result) => {
      if (!cancelled) setVersions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [prompt.id]);

  // Tabs under the action bar. History exists for anyone when versions
  // exist (and always for the owner, whose edit log lives there); DNA only
  // when the author accepted some. Prompt is always there and the default.
  const tabItems: TabItem<PromptTab>[] = [
    { key: "prompt", label: t("promptTabs.prompt") },
    ...(versions.length > 0 || isOwn ? [{ key: "history" as const, label: t("promptTabs.history") }] : []),
    ...(dnaSections.length > 0 ? [{ key: "dna" as const, label: t("promptTabs.dna") }] : []),
  ];

  return (
    <DetailShell
      entrance={morphingCover ? "fade" : "rise"}
      aside={
        <DetailAside>
          {/* Phones/tablets already show the creator (+ Follow) in the byline above. */}
          <div className="hidden lg:block">
            <CreatorSummary creator={prompt.author} isOwn={isOwn} />
          </div>
          <RelatedPrompts prompt={prompt} />
          <ContributorsPanel key={contributorsRefreshKey} promptId={prompt.id} />
        </DetailAside>
      }
    >
        <article
          className={cn(
            "min-w-0 space-y-6 rounded-lg transition-colors duration-700",
            isPostFlashed && "bg-primary/10 ring-1 ring-primary/40",
          )}
        >
          <header className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <ContentTypeLabel icon={typeMeta.icon} label={`${t(typeMeta.labelKey)} Prompt`} detail={null} />
              <PostMenu promptId={prompt.id} authorId={prompt.author.id} />
            </div>
            <div className="space-y-3">
              <DetailTitle>{prompt.title}</DetailTitle>
              {descriptionBody && <DetailLede>{descriptionBody}</DetailLede>}
              <SourceNotes notes={sourceNotes} />
              <ReferenceRequirementNotes
                                contentType={prompt.contentType}
                value={{ image: prompt.requiresReferenceImage, video: prompt.requiresReferenceVideo, audio: prompt.requiresReferenceAudio }}
              />
            </div>
            <DetailByline
              person={prompt.author}
              createdAt={prompt.createdAt}
              language={language}
              // The creator card lives in the side column, which on phones/tablets stacks far below —
              // so there the byline carries the Follow button instead of repeating the whole card.
              trailing={!isOwn ? <FollowButton user={prompt.author} className="lg:hidden" /> : undefined}
            />
          </header>

          {(prompt.contentType === "video" || prompt.contentType === "audio") ? (
            <PromptPlayableOutput prompt={prompt} />
          ) : media && (
            <figure className="space-y-2">
              <button
                ref={heroRef}
                type="button"
                onClick={() => setLightboxIndex(0)}
                aria-label={t("media.viewFullscreen")}
                className="relative block w-full overflow-hidden rounded-xl border border-border-soft bg-surface-soft shadow-card [--hero-h:260px] sm:[--hero-h:340px]"
                // Supporting output preview, not a hero image: capped short enough that the prompt block below stays near the first screen.
                style={{
                  aspectRatio: clampedAspectRatio(media.width, media.height),
                  maxWidth: `calc(var(--hero-h) * ${clampedAspectRatio(media.width, media.height)})`,
                }}
              >
                <StorageImage src={media.url} alt={media.alt} fill sizes="(min-width: 1024px) 720px, 100vw" className="object-cover" />
              </button>
              <figcaption className="text-caption text-text-muted">{t("prompt.outputCaption")}</figcaption>
              {prompt.media.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {prompt.media.slice(1).map((extra, index) => (
                    <button
                      key={extra.id}
                      type="button"
                      onClick={() => setLightboxIndex(index + 1)}
                      aria-label={t("media.viewFullscreen")}
                      className="h-16 w-16 overflow-hidden rounded-md border border-border-soft"
                    >
                      <StorageImg src={extra.url} alt={extra.alt} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </figure>
          )}
          {lightboxIndex !== null && (
            <ImageLightbox
              images={prompt.media.map((item) => ({ url: item.url, alt: item.alt }))}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}

          {prompt.origin.type === "request-response" && (
            <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
          )}

          <DetailActionBar trailing={<ShareTriggerButton target={{ contentType: "prompt", prompt }} label={t("common.share")} />}>
            <LikeButton id={prompt.id} likeCount={prompt.likeCount} size={18} />
            <CommentCountLink promptId={prompt.id} baseCount={prompt.commentCount} size={18} />
            <SaveButton promptId={prompt.id} saveCount={prompt.saveCount} size={18} />
            <StatisticsButton target={{ contentType: "prompt", contentId: prompt.id, likeCount: prompt.likeCount, commentCount: prompt.commentCount, saveCount: prompt.saveCount }} size={18} label={t("statistics.title")} />
            <RelationMapLink kind="prompt" id={prompt.id} />
          </DetailActionBar>

          {tabItems.length > 1 && (
            <Tabs items={tabItems} active={activeTab} onChange={setActiveTab} ariaLabel={t("promptTabs.ariaLabel")} />
          )}

          {activeTab === "prompt" && variables.length > 0 && (
            <PromptVariableInputs
              variables={variables}
              values={variableValues}
              visible={variableVisible}
              isCustomized={isCustomized}
              onChange={(name, value) => setVariableOverrides((prev) => ({ ...prev, [name]: value }))}
              onReset={() => setVariableOverrides({})}
            />
          )}

          {activeTab === "prompt" && (
          <section aria-labelledby="prompt-text-title" className="relative overflow-hidden rounded-xl border border-border-soft bg-surface-soft shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft px-4 py-2.5">
              <Eyebrow as="h2" id="prompt-text-title" icon={SquareTerminal}>
                {t("prompt.promptTextHeading")}
              </Eyebrow>
              <div className="flex flex-wrap items-center gap-2">
                <CopyPromptButton text={displayText} size="md" variant="primary" />
                <RunButton text={displayText} recommendedRefs={prompt.tools} />
                <span className="hidden h-5 w-px bg-border-soft sm:block" aria-hidden />
                <OpenInStudioButton kind="prompt" id={prompt.id} quiet />
                {user && !isOwn && (
                  <button
                    type="button"
                    onClick={() => setIsSuggestModalOpen(true)}
                    className="relative z-10 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-label font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text"
                  >
                    <PenLine size={14} />
                    {t("prompt.suggestEdit")}
                  </button>
                )}
              </div>
            </div>
            {variables.length > 0 && <AssembleStatus filled={assemble.filled} total={assemble.total} complete={assemble.complete} />}
            <ScrollablePrompt className="px-4 py-4 text-[0.875rem] text-text">
              {variables.length > 0 ? (
                <AssembledPromptText template={livePromptText} values={variableValues} visible={variableVisible} settled={assemble.complete} />
              ) : (
                displayText
              )}
            </ScrollablePrompt>
            <AssembleSweep seq={assemble.sweepSeq} />
          </section>
          )}

          {activeTab === "history" && (
            <div className="space-y-4">
              <PromptHistoryPanel versions={versions} />
              {isOwn && <EditHistoryPanel contentType="prompt" contentId={prompt.id} />}
              {versions.length === 0 && !isOwn && <p className="text-small text-text-muted">{t("promptTabs.historyEmpty")}</p>}
            </div>
          )}

          {activeTab === "dna" && <PromptDnaDisplay sections={dnaSections} promptTitle={prompt.title} mapHref={relationMapHref({ kind: "prompt", id: prompt.id })} />}

          <ToolLine label={t("tool.recommendedLabel")} refs={prompt.tools} legacy={prompt.tool} />

          <TaxonomyLinks contentType={prompt.contentType} category={prompt.category} subcategory={prompt.subcategory} />

          <DetailTags tags={prompt.tags} />

          <PromptResultsSection target={{ type: "prompt", promptId: prompt.id, promptText: livePromptText }} />

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

          <DetailComments>
            <CommentSection target={{ promptId: prompt.id }} highlightCommentId={highlightCommentId} />
          </DetailComments>
        </article>

      {isSuggestModalOpen && user && (
        <SuggestEditModal
          promptId={prompt.id}
          proposerId={user.id}
          promptText={livePromptText}
          onClose={() => setIsSuggestModalOpen(false)}
        />
      )}
    </DetailShell>
  );
}
