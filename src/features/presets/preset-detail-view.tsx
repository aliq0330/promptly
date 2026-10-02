"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, SlidersHorizontal, Wand2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ToolChips } from "@/features/content/tool-chips";
import { CreatorSummary } from "@/features/profile/creator-summary";
import { useAuth } from "@/features/auth/auth-provider";
import { PostMenu } from "@/features/prompts/post-menu";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { CommentSection } from "@/features/prompts/comment-section";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { fetchPresetById, recordPresetUse } from "@/lib/supabase/presets";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { presetParameterEntries } from "@/lib/preset-utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatCount, formatRelativeTime, presetHref, profileHref, tagHref } from "@/lib/utils";
import { useRealPresets } from "./real-presets-provider";
import { PresetListButton } from "./preset-list-button";
import type { Preset } from "@/types";

/**
 * `/presets/local?id=…` — the Hazır Ayar detail page, same visual hierarchy as
 * the Prompt / Generator / Workflow local pages: type line + menu, title,
 * description, creator, the Beğeni · Yorum · Kaydet · İstatistik · Paylaş row,
 * then "HAZIR AYAR İÇERİĞİ" (every parameter) and the comments, with a side
 * column on desktop. The primary action is "Bu hazır ayarı kullan" — it opens
 * the Prompt create form pre-filled with the preset (a starting
 * configuration, the user can change everything).
 */
export function PresetDetailView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { removeFromCache, realPresets } = useRealPresets();
  const id = searchParams.get("id");
  const [preset, setPreset] = useState<Preset | null | undefined>(undefined);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchPresetById(id).then((result) => !cancelled && setPreset(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const similar = useMemo(() => {
    if (!preset) return [];
    const tagSet = new Set(preset.tags.map((tag) => tag.slug));
    return realPresets
      .filter((p) => p.id !== preset.id)
      .map((p) => ({
        p,
        score:
          p.tags.filter((tag) => tagSet.has(tag.slug)).length * 3 +
          (p.contentType === preset.contentType ? 1 : 0) +
          (p.category && p.category === preset.category ? 2 : 0) +
          (p.creator.id === preset.creator.id ? 1 : 0),
      }))
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ p }) => p);
  }, [preset, realPresets]);

  if (!id) return <NotFoundBlock title={t("preset.notFoundTitle")} description={t("common.brokenLinkHint")} />;
  if (preset === undefined) return <DetailSkeleton />;
  if (!preset) return <NotFoundBlock title={t("preset.notFoundTitle")} description={t("preset.notFoundBody")} />;

  const entries = presetParameterEntries(preset.selection, language);
  const category = taxonomyPathLabel(preset, language, true);
  const isOwn = user?.id === preset.creator.id;
  const highlight = searchParams.get("hl");
  const highlightCommentId = highlight?.startsWith("comment:") ? highlight.slice("comment:".length) : null;
  const useHref = `/create?preset=${preset.id}`;

  function handleUse() {
    if (user && preset) void recordPresetUse(preset.id, user.id);
  }

  const useButton = (
    <Link href={useHref} onClick={handleUse} className={buttonClassName({ size: "lg" })}>
      <Wand2 size={18} aria-hidden />
      {t("preset.use")}
      <ArrowRight size={16} aria-hidden />
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <article className="min-w-0 space-y-5">
          <header className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <ContentTypeLabel icon={SlidersHorizontal} label={t("preset.singular")} detail={category} />
              <div className="flex items-center gap-2">
                {preset.status === "draft" ? (
                  <Badge variant="warning">{t("preset.draftBadge")}</Badge>
                ) : preset.visibility === "private" ? (
                  <Badge variant="neutral">{t("preset.privateBadge")}</Badge>
                ) : null}
                <PostMenu
                  presetId={preset.id}
                  authorId={preset.creator.id}
                  onDeleted={() => {
                    removeFromCache(preset.id);
                    router.push("/presets");
                  }}
                />
              </div>
            </div>
            <h1 className="text-h1 font-semibold text-text">{preset.title}</h1>
            {preset.description && <p className="max-w-2xl text-body text-text-secondary">{preset.description}</p>}
            <Link href={profileHref(preset.creator)} className="group inline-flex max-w-full items-center gap-2.5 rounded-md">
              <Avatar src={preset.creator.avatarUrl} alt={preset.creator.displayName} size={32} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-label font-semibold text-text group-hover:text-primary">{preset.creator.displayName}</span>
                <span className="block truncate text-caption text-text-muted">
                  @{preset.creator.username} · {formatRelativeTime(preset.createdAt, language)}
                </span>
              </span>
            </Link>
          </header>

          <div className="flex flex-wrap items-center gap-0.5 border-y border-border-soft py-1.5">
            <LikeButton id={preset.id} likeCount={preset.likeCount} contentType="preset" size={18} />
            <CommentCountLink presetId={preset.id} baseCount={preset.commentCount} size={18} />
            <SaveButton presetId={preset.id} saveCount={preset.saveCount} size={18} />
            <StatisticsButton
              target={{ contentType: "preset", contentId: preset.id, likeCount: preset.likeCount, commentCount: preset.commentCount, saveCount: preset.saveCount, useCount: preset.useCount }}
              size={18}
              label={t("statistics.title")}
            />
            <span className="ml-auto" />
            <ShareTriggerButton target={{ contentType: "preset", preset }} label={t("common.share")} />
          </div>

          <div className="flex flex-wrap items-start gap-3 rounded-lg border border-primary/20 bg-primary-soft/50 p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-label font-semibold text-text">{t("preset.useTitle")}</p>
              <p className="text-small text-text-secondary">{t("preset.useHint")}</p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {useButton}
              {!isOwn && <PresetListButton presetId={preset.id} saveCount={preset.saveCount} />}
            </div>
          </div>

          {preset.coverUrl && (
            <button type="button" onClick={() => setLightbox(true)} aria-label={t("media.viewFullscreen")} className="block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- real local data-URL cover */}
              <img src={preset.coverUrl} alt="" className="aspect-video w-full rounded-lg border border-border-soft object-cover" />
            </button>
          )}
          {lightbox && preset.coverUrl && (
            <ImageLightbox images={[{ url: preset.coverUrl, alt: preset.title }]} initialIndex={0} onClose={() => setLightbox(false)} />
          )}

          <section aria-labelledby="preset-contents-title" className="overflow-hidden rounded-lg border border-border-soft bg-surface-soft">
            <div className="border-b border-border-soft px-4 py-2.5">
              <h2 id="preset-contents-title" className="flex items-center gap-1.5 font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                <SlidersHorizontal size={13} aria-hidden />
                {t("preset.contentsTitle")}
              </h2>
            </div>
            {entries.length === 0 ? (
              <p className="px-4 py-4 text-small text-text-muted">{t("preset.noParameters")}</p>
            ) : (
              <dl className="grid gap-px bg-border-soft sm:grid-cols-2">
                {entries.map((entry) => (
                  <div key={entry.groupId} className="flex items-baseline justify-between gap-3 bg-surface px-4 py-2.5">
                    <dt className="shrink-0 text-small text-text-muted">{entry.groupLabel}</dt>
                    <dd className="min-w-0 truncate text-right text-small font-semibold text-text">{entry.optionLabel}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <div className="space-y-2">
            <p className="text-caption font-medium text-text-muted">{t("tool.recommendedLabel")}</p>
            {preset.tools.length > 0 ? (
              <ToolChips refs={preset.tools} />
            ) : (
              <span className="inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-secondary">{t("preset.generalTool")}</span>
            )}
          </div>

          {preset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {preset.tags.map((tag) => (
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

          <CommentSection target={{ presetId: preset.id }} highlightCommentId={highlightCommentId} />
        </article>

        <aside className="mt-8 space-y-5 lg:mt-0">
          <CreatorSummary creator={preset.creator} isOwn={isOwn} />

          <section aria-labelledby="preset-info-title" className="space-y-2">
            <h2 id="preset-info-title" className="px-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
              {t("preset.sidebarInfo")}
            </h2>
            <dl className="divide-y divide-border-soft overflow-hidden rounded-lg border border-border-soft bg-surface text-small">
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-text-muted">{t("preset.parameters")}</dt>
                <dd className="font-semibold tabular-nums text-text">{entries.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-text-muted">{t("preset.usesLabel")}</dt>
                <dd className="font-semibold tabular-nums text-text">{formatCount(preset.useCount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-text-muted">{t("preset.categoryLabel")}</dt>
                <dd className="truncate font-semibold text-text">{category}</dd>
              </div>
            </dl>
          </section>

          {similar.length > 0 && (
            <section aria-labelledby="preset-similar-title" className="space-y-2">
              <h2 id="preset-similar-title" className="px-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                {t("preset.similar")}
              </h2>
              <ul className="divide-y divide-border-soft overflow-hidden rounded-lg border border-border-soft bg-surface">
                {similar.map((p) => (
                  <li key={p.id}>
                    <Link href={presetHref(p)} className="flex items-start gap-3 px-3.5 py-3 transition-colors duration-200 hover:bg-surface-soft">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
                        <SlidersHorizontal size={14} />
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="line-clamp-2 text-label font-semibold text-text">{p.title}</span>
                        <span className="mt-0.5 block truncate text-caption text-text-muted">
                          {t("preset.paramCount", { count: Object.keys(p.selection).length })} · {p.creator.displayName}
                        </span>
                      </span>
                    </Link>
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
