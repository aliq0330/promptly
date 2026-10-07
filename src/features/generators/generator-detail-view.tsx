"use client";

import { RunButton } from "@/features/content/run-with-ai";
import { OpenInStudioButton } from "@/features/studio/open-in-studio";
import { ToolLine } from "@/features/content/tool-chips";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Blocks, SlidersHorizontal, SquareTerminal } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { PostMenu } from "@/features/prompts/post-menu";
import { CreatorSummary } from "@/features/profile/creator-summary";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { GeneratorPlayground } from "./generator-playground";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { CommentSection } from "@/features/prompts/comment-section";
import { EditHistoryPanel } from "@/features/prompts/edit-history-panel";
import { PromptResultsSection } from "@/features/prompts/prompt-results-section";
import {
  fetchGeneratorBySlug,
  fetchGeneratorVersion,
  recordGeneratorRun,
  type GeneratorVersionResult,
} from "@/lib/supabase/generators";
import { useRealGenerators } from "./real-generators-provider";
import { formatRelativeTime, profileHref, tagHref } from "@/lib/utils";
import { composeRunText } from "@/lib/run-with-ai";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import type { Generator, GeneratorValues } from "@/types";

/**
 * The real public generator detail + runtime page (`/generators/local?
 * slug=…` — §41/§20). Reuses `GeneratorPlayground` unchanged for the actual
 * "Generatoru Kullan" section, so the runtime a visitor uses here is
 * LITERALLY the same component the builder's own Live Preview/Preview step
 * already exercises (CLAUDE.md §12/§13).
 *
 * "Open in Prompt"/"Save" (§21-24) were deliberately collapsed into ONE real
 * bridge rather than two divergent paths: a generated prompt still needs a
 * title/author-facing description/content-type/tags before it can become a
 * real `Prompt` row, none of which a generator run has — so "Prompt Olarak
 * Aç" always records a real `generator_runs` row (so the origin link is
 * never lost) and hands off to `CreatePromptForm`'s new `?generatorRun=`
 * mode (task #8) to finish and actually publish, instead of a second,
 * parallel "instant save" action that would need to invent those missing
 * fields on its own.
 */
export function GeneratorDetailView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const { user } = useAuth();
  const { removeFromCache } = useRealGenerators();

  const [generator, setGenerator] = useState<Generator | null>(null);
  const [version, setVersion] = useState<GeneratorVersionResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isOpeningPrompt, setIsOpeningPrompt] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no slug to look up
      setLoaded(true);
      return;
    }
    setLoaded(false);
    fetchGeneratorBySlug(slug).then(async (found) => {
      if (cancelled) return;
      if (!found) {
        setGenerator(null);
        setLoaded(true);
        return;
      }
      const ver = found.currentVersionId ? await fetchGeneratorVersion(found.currentVersionId) : null;
      if (cancelled) return;
      setGenerator(found);
      setVersion(ver);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug || !loaded) {
    return !slug ? <NotFoundBlock title={t("generator.linkNotFoundTitle")} description={t("common.brokenLinkHint")} /> : <DetailSkeleton />;
  }

  if (!generator || !version) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("generator.linkNotFoundTitle")}</h1>
        <p className="text-sm text-text-muted">{t("generator.notFoundBody")}</p>
      </div>
    );
  }

  const isOwner = user?.id === generator.creator.id;

  function handleDeleted() {
    removeFromCache(generator!.id);
    router.push("/generators");
  }

  async function handleOpenInPrompt(state: { values: GeneratorValues; prompt: string; negativePrompt: string | null }) {
    if (!user || !generator || !version) return;
    setIsOpeningPrompt(true);
    setActionError(null);
    try {
      const run = await recordGeneratorRun(generator.id, version.id, user.id, state.values, state.prompt, state.negativePrompt);
      router.push(`/create?generatorRun=${run.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("generator.recordFailed"));
      setIsOpeningPrompt(false);
    }
  }

  const canOpenInPrompt = generator.allowPromptEditing || generator.allowSavingGeneratedPrompts;

  const topic = taxonomyPathLabel(generator, language);
  const fields = [...version.schema.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <article className="min-w-0 space-y-5">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ContentTypeLabel
                icon={Blocks}
                label={t("generator.singular")}
                detail={topic}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {generator.status === "draft" && <Badge variant="warning">{t("generator.draftBadge")}</Badge>}
                {generator.visibility === "unlisted" && generator.status === "published" && <Badge variant="outline">{t("generator.unlistedBadge")}</Badge>}
                <PostMenu
                  generatorId={generator.id}
                  generatorSlug={generator.slug}
                  authorId={generator.creator.id}
                  onDeleted={handleDeleted}
                />
              </div>
            </div>
            <div className="flex items-start gap-4">
              {generator.coverUrl && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(0)}
                  aria-label={t("media.viewFullscreen")}
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border-soft sm:h-20 sm:w-20"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a real, potentially locally-produced data URL cover (see generator-details-form.tsx) */}
                  <img src={generator.coverUrl} alt="" className="h-full w-full object-cover" />
                  {generator.media.length > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[0.65rem] font-medium text-white">
                      {t("media.moreImagesBadge", { count: generator.media.length - 1 })}
                    </span>
                  )}
                </button>
              )}
              <div className="min-w-0 space-y-2">
                <h1 className="text-h1 font-semibold text-text">{generator.title}</h1>
                <p className="max-w-2xl text-body text-text-secondary">{generator.description}</p>
              </div>
            </div>
            {generator.media.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {generator.media.slice(1).map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLightboxIndex(index + 1)}
                    aria-label={t("media.viewFullscreen")}
                    className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border-soft"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail strip, same source list as the cover */}
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {lightboxIndex !== null && (
              <ImageLightbox
                images={generator.media.map((item) => ({ url: item.url, alt: item.alt }))}
                initialIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            )}
            <Link href={profileHref(generator.creator)} className="group inline-flex items-center gap-2.5 rounded-md">
              <Avatar src={generator.creator.avatarUrl} alt={generator.creator.displayName} size={32} />
              <span className="leading-tight">
                <span className="block text-label font-semibold text-text group-hover:text-primary">{generator.creator.displayName}</span>
                <span className="block text-caption text-text-muted">
                  @{generator.creator.username} · {formatRelativeTime(generator.createdAt, language)}
                </span>
              </span>
            </Link>
          </header>

          {/*
            Standardized action row (Promptly Etkileşim Butonları Düzeni
            görevi) — Beğeni/Yorum/Kaydet grouped on the left, Paylaş always
            alone on the far right, identical to PromptCardFooter/
            PromptDetailView/RequestDetailView. The old trailing "X
            kaydetme" community count (right of Paylaş) is gone — it was the
            one place any content type showed an aggregate count in this
            row, and it pushed Paylaş out of the standard rightmost spot.
          */}
          <div className="flex flex-wrap items-center gap-0.5 border-y border-border-soft py-1.5">
            <LikeButton id={generator.id} likeCount={generator.likeCount} contentType="generator" size={18} />
            <CommentCountLink generatorSlug={generator.slug} generatorId={generator.id} baseCount={generator.commentCount} size={18} />
            <SaveButton generatorId={generator.id} saveCount={generator.saveCount} size={18} />
            <StatisticsButton target={{ contentType: "generator", contentId: generator.id, likeCount: generator.likeCount, commentCount: generator.commentCount, saveCount: generator.saveCount }} size={18} label={t("statistics.title")} />
            <span className="ml-auto" />
            <ShareTriggerButton target={{ contentType: "generator", generator }} label={t("common.share")} />
          </div>

          <section aria-labelledby="generator-use-title" className="overflow-hidden rounded-lg border border-border-soft bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft bg-surface-soft px-4 py-3">
              <h2 id="generator-use-title" className="text-h3 font-semibold text-text">
                {t("generator.useThisGenerator")}
              </h2>
              <p className="flex items-center gap-1.5 text-caption text-text-muted">
                <SlidersHorizontal size={13} /> {t("generator.chooseParameters")}
                <ArrowRight size={12} />
                <SquareTerminal size={13} /> {t("generator.getYourPrompt")}
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <GeneratorPlayground
                schema={version.schema}
                enableNegativePrompt={generator.enableNegativePrompt}
                renderActions={(state) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <RunButton
                      text={composeRunText(state.prompt, state.negativePrompt)}
                      recommendedRefs={generator.tools}
                      preview
                    />
                    <OpenInStudioButton refs={{ generator: generator.slug }} />
                    {canOpenInPrompt &&
                      (user ? (
                        <Button type="button" onClick={() => handleOpenInPrompt(state)} disabled={isOpeningPrompt || !state.prompt.trim()}>
                          {isOpeningPrompt ? t("generator.opening") : t("generator.openAsPrompt")}
                        </Button>
                      ) : (
                        <p className="text-caption text-text-muted">
                          {t("generator.loginToOpenAsPromptPrefix")}{" "}
                          <Link href="/login" className="font-medium text-primary hover:underline">
                            {t("common.login")}
                          </Link>
                          .
                        </p>
                      ))}
                  </div>
                )}
              />
            </div>
          </section>

          <PromptResultsSection target={{ type: "generator", generatorId: generator.id }} />

          <ToolLine label={t("tool.recommendedLabel")} refs={generator.tools} />

          {generator.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {generator.tags.map((tag) => (
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

          {isOwner && <EditHistoryPanel contentType="generator" contentId={generator.id} />}
          {actionError && <p className="text-small text-danger">{actionError}</p>}
          {!user && (
            <p className="text-caption text-text-muted">
              {t("generator.loginToSaveOrCreatePrefix")}{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                {t("common.login")}
              </Link>
              .
            </p>
          )}

          <section id="comments" className="scroll-mt-20 rounded-lg border border-border-soft bg-surface p-4 sm:p-5">
            <CommentSection target={{ generatorId: generator.id }} />
          </section>
        </article>

        <aside className="mt-6 space-y-5 lg:sticky lg:top-24 lg:mt-0 lg:self-start">
          <CreatorSummary creator={generator.creator} isOwn={isOwner} />

          {fields.length > 0 && (
            <section aria-labelledby="generator-structure-title" className="space-y-2">
              <h2 id="generator-structure-title" className="px-1 font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                {t("generator.promptStructureHeading")} · {t("generator.parameterCount", { count: fields.length })}
              </h2>
              <ul className="divide-y divide-border-soft overflow-hidden rounded-lg border border-border-soft bg-surface">
                {fields.map((field) => (
                  <li key={field.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="min-w-0 truncate text-label font-medium text-text">{field.label}</span>
                    <code className="shrink-0 truncate rounded-xs bg-surface-soft px-1.5 py-0.5 font-mono text-[0.6875rem] text-text-muted">
                      {field.jsonPath || field.key}
                    </code>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
