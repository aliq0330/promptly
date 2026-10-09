"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal, WandSparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { fetchPresetById } from "@/lib/supabase/presets";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { presetParameterCount, presetParameterEntries } from "@/lib/preset-utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetHref } from "@/lib/utils";
import {
  AsideLinkRow,
  AsideSection,
  DetailActionBar,
  DetailAside,
  DetailByline,
  DetailComments,
  DetailLede,
  DetailShell,
  DetailTags,
  DetailTitle,
  Eyebrow,
} from "@/features/content/detail-parts";
import { useRealPresets } from "./real-presets-provider";
import { PresetSaveCta } from "./preset-save-cta";
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

  const entries = presetParameterEntries(preset, language);
  const category = taxonomyPathLabel(preset, language, true);
  const isOwn = user?.id === preset.creator.id;
  const highlight = searchParams.get("hl");
  const highlightCommentId = highlight?.startsWith("comment:") ? highlight.slice("comment:".length) : null;

  const aside = (
    <DetailAside>
      <CreatorSummary creator={preset.creator} isOwn={isOwn} />

      <AsideSection id="preset-info-title" title={t("preset.sidebarInfo")}>
        <dl className="divide-y divide-border-soft text-small">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-text-muted">{t("preset.parameters")}</dt>
            <dd className="font-semibold tabular-nums text-text">{entries.length}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-text-muted">{t("preset.categoryLabel")}</dt>
            <dd className="truncate font-semibold text-text">{category}</dd>
          </div>
        </dl>
      </AsideSection>

      {similar.length > 0 && (
        <AsideSection id="preset-similar-title" title={t("preset.similar")}>
          <ul className="divide-y divide-border-soft">
            {similar.map((p) => (
              <li key={p.id}>
                <AsideLinkRow
                  href={presetHref(p)}
                  icon={SlidersHorizontal}
                  title={p.title}
                  meta={`${t("preset.paramCount", { count: presetParameterCount(p) })} · ${p.creator.displayName}`}
                />
              </li>
            ))}
          </ul>
        </AsideSection>
      )}
    </DetailAside>
  );

  return (
    <DetailShell aside={aside}>
      <article className="min-w-0 space-y-6">
        <header className="space-y-4">
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
          <div className="space-y-3">
            <DetailTitle>{preset.title}</DetailTitle>
            {preset.description && <DetailLede>{preset.description}</DetailLede>}
          </div>
          <DetailByline person={preset.creator} createdAt={preset.createdAt} language={language} />
        </header>

        <DetailActionBar trailing={<ShareTriggerButton target={{ contentType: "preset", preset }} label={t("common.share")} />}>
          <LikeButton id={preset.id} likeCount={preset.likeCount} contentType="preset" size={18} />
          <CommentCountLink presetId={preset.id} baseCount={preset.commentCount} size={18} />
          <SaveButton presetId={preset.id} saveCount={preset.saveCount} size={18} />
          <StatisticsButton
            target={{ contentType: "preset", contentId: preset.id, likeCount: preset.likeCount, commentCount: preset.commentCount, saveCount: preset.saveCount }}
            size={18}
            label={t("statistics.title")}
          />
        </DetailActionBar>

        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-primary/20 bg-primary-soft/50 p-4 sm:p-5">
          <div className="min-w-0 flex-1 space-y-3">
            {!isOwn && (
              <div className="space-y-1">
                <p className="text-label font-semibold text-text">{t("preset.saveTitle")}</p>
                <p className="text-small text-text-secondary">{t("preset.saveHint")}</p>
              </div>
            )}
            <p className="text-small text-text-secondary">{isOwn ? t("preset.useOwnHint") : t("preset.useHint")}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-stretch">
            {!isOwn && <PresetSaveCta presetId={preset.id} saveCount={preset.saveCount} />}
            <Link href={`/generate?preset=${preset.id}`} className={buttonClassName({ variant: isOwn ? "primary" : "outline", size: "lg" })}>
              <WandSparkles size={18} aria-hidden /> {t("preset.use")}
            </Link>
          </div>
        </div>

        {preset.coverUrl && (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label={t("media.viewFullscreen")}
            className="block w-full overflow-hidden rounded-xl border border-border-soft shadow-card"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- real local data-URL cover */}
            <img src={preset.coverUrl} alt="" className="aspect-video w-full object-cover" />
          </button>
        )}
        {lightbox && preset.coverUrl && (
          <ImageLightbox images={[{ url: preset.coverUrl, alt: preset.title }]} initialIndex={0} onClose={() => setLightbox(false)} />
        )}

        <section aria-labelledby="preset-contents-title" className="overflow-hidden rounded-xl border border-border-soft bg-surface-soft shadow-card">
          <div className="border-b border-border-soft px-4 py-3">
            <Eyebrow as="h2" id="preset-contents-title" icon={SlidersHorizontal}>
              {t("preset.contentsTitle")}
            </Eyebrow>
          </div>
          {entries.length === 0 ? (
            <p className="px-4 py-4 text-small text-text-muted">{t("preset.noParameters")}</p>
          ) : (
            <dl className="grid gap-px bg-border-soft sm:grid-cols-2">
              {entries.map((entry) => (
                <div key={entry.fieldId} className="flex items-baseline justify-between gap-3 bg-surface px-4 py-2.5">
                  <dt className="shrink-0 text-small text-text-muted">{entry.fieldLabel}</dt>
                  <dd className="min-w-0 truncate text-right text-small font-semibold text-text">{entry.valueLabel}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption font-medium text-text-muted">{t("tool.recommendedLabel")}</span>
          {preset.tools.length > 0 ? (
            <ToolChips refs={preset.tools} />
          ) : (
            <span className="inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-secondary">{t("preset.generalTool")}</span>
          )}
        </div>

        <DetailTags tags={preset.tags} />

        <DetailComments>
          <CommentSection target={{ presetId: preset.id }} highlightCommentId={highlightCommentId} />
        </DetailComments>
      </article>
    </DetailShell>
  );
}
