"use client";

import { EngageCommentCount, EngageComments, EngageLike, EngageSave, EngageShare, EngageStatistics } from "@/features/content/scoped-engagement";
import { usePageTitle } from "@/components/layout/page-title";
import { RunButton } from "@/features/content/run-with-ai";
import { DetailMetaCard } from "@/features/content/detail-meta-card";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PenLine } from "lucide-react";
import { OpenInStudioButton } from "@/features/studio/open-in-studio-button";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { RelatedPrompts } from "@/features/prompts/related-prompts";
import { TaxonomyLinks } from "@/features/content/taxonomy-links";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { RequestResponseContext } from "@/features/prompts/post-context";
import { RelationMapLink } from "@/features/relations/relation-map-link";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { PromptDnaDisplay } from "@/features/prompts/prompt-dna-display";
import { PromptVariableInputs } from "@/features/prompts/prompt-variable-inputs";
import { EditHistoryPanel } from "@/features/prompts/edit-history-panel";
import { SuggestEditModal } from "@/features/prompts/suggest-edit-modal";
import { EditSuggestionsPanel } from "@/features/prompts/edit-suggestions-panel";
import { PromptHistoryPanel } from "@/features/prompts/prompt-history-panel";
import { VersionRestoreToast } from "@/features/versions/version-restore-toast";
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
import { cn, formatCount, promptHref, relationMapHref } from "@/lib/utils";
import { splitSourceNotes } from "@/lib/source-notes";
import { SourceNotes } from "@/features/content/source-notes";
import { FollowButton } from "@/features/profile/follow-button";
import { AsideSection, DetailActionBar, DetailArt, DetailArtPlaceholder, DetailArtThumb, DetailAside, DetailBand, DetailByline, DetailComments, DetailLede, DetailSection, DetailShell, DetailTags, DetailTitle } from "@/features/content/detail-parts";
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

  // Tabs under the action bar. History exists (for anyone, owner included) only when versions exist — a never-edited
  // prompt has no history tab; DNA only when the author accepted some. Prompt is always there and the default.
  const tabItems: TabItem<PromptTab>[] = [
    { key: "prompt", label: t("promptTabs.prompt") },
    ...(versions.length > 0 ? [{ key: "history" as const, label: t("promptTabs.history") }] : []),
    ...(dnaSections.length > 0 ? [{ key: "dna" as const, label: t("promptTabs.dna") }] : []),
  ];

  // The album art: the author's own video/audio result, else the picture(s), else the type's icon.
  const art = prompt.contentType === "video" || prompt.contentType === "audio" ? (
    <PromptPlayableOutput prompt={prompt} />
  ) : media ? (
    <DetailArt
      ratio={clampedAspectRatio(media.width, media.height)}
      caption={t("prompt.outputCaption")}
      onOpen={() => setLightboxIndex(0)}
      buttonRef={heroRef}
      thumbnails={
        prompt.media.length > 1
          ? prompt.media.slice(1).map((extra, index) => (
              <DetailArtThumb key={extra.id} onOpen={() => setLightboxIndex(index + 1)}>
                <StorageImg src={extra.url} alt={extra.alt} className="h-full w-full object-cover" />
              </DetailArtThumb>
            ))
          : undefined
      }
    >
      <StorageImage src={media.url} alt={media.alt} fill sizes="(min-width: 768px) 520px, 100vw" className="object-cover" />
    </DetailArt>
  ) : (
    <DetailArtPlaceholder icon={typeMeta.icon} />
  );

  return (
    <DetailShell
      entrance={morphingCover ? "fade" : "rise"}
      band={
        <DetailBand
          art={art}
          backdrop={media ? <StorageImage src={media.url} alt="" fill sizes="50vw" className="object-cover" /> : undefined}
          kicker={<ContentTypeLabel icon={typeMeta.icon} label={`${t(typeMeta.labelKey)} Prompt`} detail={null} />}
          title={<DetailTitle>{prompt.title}</DetailTitle>}
          byline={
            <DetailByline
              person={prompt.author}
              createdAt={prompt.createdAt}
              language={language}
              meta={prompt.copyCount > 0 ? (prompt.copyCount === 1 ? t("prompt.usedOnce") : t("prompt.usedCount", { count: formatCount(prompt.copyCount) })) : undefined}
            />
          }
        />
      }
      actions={
        <DetailActionBar
          primary={<CopyPromptButton text={displayText} promptId={prompt.id} size="lg" variant="primary" label={t("prompt.copyPrompt")} />}
          extra={
            <>
              {!isOwn && <FollowButton user={prompt.author} />}
              <PostMenu promptId={prompt.id} communityId={prompt.communityId} authorId={prompt.author.id} />
            </>
          }
          trailing={<EngageShare target={{ contentType: "prompt", prompt }} />}
        >
          <EngageLike id={prompt.id} likeCount={prompt.likeCount} size={20} />
          <EngageCommentCount promptId={prompt.id} baseCount={prompt.commentCount} size={20} />
          <EngageSave promptId={prompt.id} saveCount={prompt.saveCount} size={20} />
          <EngageStatistics target={{ contentType: "prompt", contentId: prompt.id, likeCount: prompt.likeCount, commentCount: prompt.commentCount, saveCount: prompt.saveCount, copyCount: prompt.copyCount }} size={20} />
          <RelationMapLink kind="prompt" id={prompt.id} />
        </DetailActionBar>
      }
      aside={
        <DetailAside>
          <AsideSection id="detail-about-title" title={t("profile.tabAbout")} bare>
            <DetailMetaCard
              toolLabel={t("tool.recommendedLabel")}
              toolRefs={prompt.tools}
              legacyTool={prompt.tool}
              hasChips={Boolean(prompt.category) || prompt.tags.length > 0}
            >
              <TaxonomyLinks className="contents" contentType={prompt.contentType} category={prompt.category} subcategory={prompt.subcategory} />
              <DetailTags className="contents" tags={prompt.tags} />
            </DetailMetaCard>
          </AsideSection>
          <RelatedPrompts prompt={prompt} />
          <ContributorsPanel key={contributorsRefreshKey} promptId={prompt.id} />
        </DetailAside>
      }
    >
        <article
          className={cn(
            "min-w-0 space-y-8 rounded-lg transition-colors duration-700",
            isPostFlashed && "bg-primary/10 ring-1 ring-primary/40",
          )}
        >
          <div className="space-y-3 empty:hidden">
            {descriptionBody && <DetailLede>{descriptionBody}</DetailLede>}
            <SourceNotes notes={sourceNotes} />
            <ReferenceRequirementNotes
              contentType={prompt.contentType}
              value={{ image: prompt.requiresReferenceImage, video: prompt.requiresReferenceVideo, audio: prompt.requiresReferenceAudio }}
            />
          </div>

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


          {tabItems.length > 1 && (
            <Tabs items={tabItems} active={activeTab} onChange={setActiveTab} ariaLabel={t("promptTabs.ariaLabel")} />
          )}

          {/* Fill in the variables first, then copy the assembled prompt below. */}
          {activeTab === "prompt" && variables.length > 0 && (
            <DetailSection title={t("detail.adaptTitle")}>
              <PromptVariableInputs
                variables={variables}
                values={variableValues}
                visible={variableVisible}
                isCustomized={isCustomized}
                onChange={(name, value) => setVariableOverrides((prev) => ({ ...prev, [name]: value }))}
                onReset={() => setVariableOverrides({})}
              />
            </DetailSection>
          )}

          {activeTab === "prompt" && (
            <DetailSection
              id="prompt-text"
              title={t("prompt.promptTextHeading")}
            >
              <div data-prompt-block className="relative overflow-hidden rounded-[22px] bg-surface-soft">
                {variables.length > 0 && <AssembleStatus filled={assemble.filled} total={assemble.total} complete={assemble.complete} />}
                <ScrollablePrompt className="px-5 py-5 text-[0.875rem] text-text">
                  {variables.length > 0 ? (
                    <AssembledPromptText template={livePromptText} values={variableValues} visible={variableVisible} settled={assemble.complete} />
                  ) : (
                    displayText
                  )}
                </ScrollablePrompt>
                <AssembleSweep seq={assemble.sweepSeq} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CopyPromptButton text={displayText} promptId={prompt.id} size="md" variant="primary" />
                <RunButton text={displayText} recommendedRefs={prompt.tools} promptId={prompt.id} />
                <OpenInStudioButton kind="prompt" id={prompt.id} quiet />
              </div>
              {user && !isOwn && (
                <button
                  type="button"
                  onClick={() => setIsSuggestModalOpen(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-full px-1 text-label font-medium text-text-secondary transition-colors hover:text-primary"
                >
                  <PenLine size={14} aria-hidden />
                  {t("prompt.suggestEdit")}
                </button>
              )}
            </DetailSection>
          )}

          {activeTab === "history" && versions.length > 0 && (
            <div className="space-y-4">
              <PromptHistoryPanel promptId={prompt.id} versions={versions} isOwner={isOwn} />
              {isOwn && <EditHistoryPanel contentType="prompt" contentId={prompt.id} />}
            </div>
          )}

          {activeTab === "dna" && <PromptDnaDisplay sections={dnaSections} promptTitle={prompt.title} mapHref={relationMapHref({ kind: "prompt", id: prompt.id })} />}

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
            <EngageComments target={{ promptId: prompt.id }} highlightCommentId={highlightCommentId} headless />
          </DetailComments>
          <VersionRestoreToast contentId={prompt.id} />
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
