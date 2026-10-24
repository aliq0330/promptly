"use client";

import { EngageCommentCount, EngageComments, EngageLike, EngageSave, EngageShare, EngageStatistics } from "@/features/content/scoped-engagement";
import { usePageTitle } from "@/components/layout/page-title";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal, WandSparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { DetailMetaCard } from "@/features/content/detail-meta-card";
import { FollowButton } from "@/features/profile/follow-button";
import { StudioSourcePicker } from "@/features/studio/studio-source-picker";
import { RelatedPresets } from "./related-presets";
import { useAuth } from "@/features/auth/auth-provider";
import { PostMenu } from "@/features/prompts/post-menu";
import { PresetHistoryPanel } from "@/features/versions/content-history-panels";
import { VersionRestoreToast } from "@/features/versions/version-restore-toast";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { fetchVersionsForPreset } from "@/lib/supabase/content-versions";
import { fetchPresetById } from "@/lib/supabase/presets";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { presetParameterEntries } from "@/lib/preset-utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  AsideSection,
  DetailActionBar,
  DetailArt,
  DetailArtPlaceholder,
  DetailAside,
  DetailBand,
  DetailByline,
  DetailComments,
  DetailLede,
  DetailShell,
  DetailTags,
  DetailTitle,
  DetailSection,
} from "@/features/content/detail-parts";
import { useRealPresets } from "./real-presets-provider";
import { PresetSaveCta } from "./preset-save-cta";
import type { Preset, PresetVersion } from "@/types";

/**
 * `/presets/local?id=…` — the Hazır Ayar detail page, same visual hierarchy as
 * the Prompt / Generator / Workflow local pages: type line + menu, title,
 * description, creator, the Beğeni · Yorum · Kaydet · İstatistik · Paylaş row,
 * then "HAZIR AYAR İÇERİĞİ" (every parameter) and the comments, with a side
 * column on desktop. The primary action is "Bu hazır ayarı kullan" — it opens
 * the Prompt create form pre-filled with the preset (a starting
 * configuration, the user can change everything).
 */
export function PresetDetailView({ presetId }: { presetId?: string } = {}) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { removeFromCache } = useRealPresets();
  // `presetId`: başvuru gönderisi sayfası aynı sayfayı gönderinin başvurduğu hazır ayar ile çizer (adresteki `id` gönderinindir).
  const id = presetId ?? searchParams.get("id");
  const [preset, setPreset] = useState<Preset | null | undefined>(undefined);
  const [lightbox, setLightbox] = useState(false);
  const [tryPicker, setTryPicker] = useState(false);
  const [versions, setVersions] = useState<PresetVersion[]>([]);
  // Content (the default) or history — history exists only when the preset has versions, owner included.
  const [tab, setTab] = useState<"preset" | "history">("preset");
  usePageTitle(preset?.title);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchPresetById(id).then((result) => !cancelled && setPreset(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchVersionsForPreset(id).then((result) => !cancelled && setVersions(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <NotFoundBlock title={t("preset.notFoundTitle")} description={t("common.brokenLinkHint")} />;
  if (preset === undefined) return <DetailSkeleton />;
  if (!preset) return <NotFoundBlock title={t("preset.notFoundTitle")} description={t("preset.notFoundBody")} />;

  const entries = presetParameterEntries(preset, language);
  const category = taxonomyPathLabel(preset, language, true);
  const isOwn = user?.id === preset.creator.id;
  const highlight = searchParams.get("hl");
  const highlightCommentId = highlight?.startsWith("comment:") ? highlight.slice("comment:".length) : null;

  const tabItems: TabItem<"preset" | "history">[] = [
    { key: "preset", label: t("preset.singular") },
    ...(versions.length > 0 ? [{ key: "history" as const, label: t("history.tab") }] : []),
  ];

  const aside = (
    <DetailAside>
      <AsideSection id="detail-about-title" title={t("profile.tabAbout")} bare>
          <DetailMetaCard toolLabel={t("tool.recommendedLabel")} toolRefs={preset.tools} fallbackTool={t("preset.generalTool")} hasChips={preset.tags.length > 0} quoteCount={preset.quoteCount}>
            <DetailTags className="contents" tags={preset.tags} />
          </DetailMetaCard>
      </AsideSection>
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

      <RelatedPresets preset={preset} />
    </DetailAside>
  );

  // The album art: the cover, else the preset icon.
  const art = preset.coverUrl ? (
    <DetailArt ratio={16 / 9} caption={preset.title} onOpen={() => setLightbox(true)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- real local data-URL cover */}
      <img src={preset.coverUrl} alt="" className="h-full w-full object-cover" />
    </DetailArt>
  ) : (
    <DetailArtPlaceholder icon={SlidersHorizontal} />
  );

  return (
    <DetailShell
      band={
        <DetailBand
          art={art}
          // eslint-disable-next-line @next/next/no-img-element -- decorative tint of the same cover
          backdrop={preset.coverUrl ? <img src={preset.coverUrl} alt="" className="h-full w-full object-cover" /> : undefined}
          kicker={
            <div className="flex flex-wrap items-center gap-2">
              <ContentTypeLabel icon={SlidersHorizontal} label={t("preset.singular")} detail={category} />
              {preset.status === "draft" ? (
                <Badge variant="warning">{t("preset.draftBadge")}</Badge>
              ) : preset.visibility === "private" ? (
                <Badge variant="neutral">{t("preset.privateBadge")}</Badge>
              ) : null}
            </div>
          }
          title={<DetailTitle>{preset.title}</DetailTitle>}
          byline={<DetailByline person={preset.creator} createdAt={preset.createdAt} language={language} follow={!isOwn && <FollowButton user={preset.creator} />} />}
          menu={
            <PostMenu
              presetId={preset.id}
              communityId={preset.communityId}
              authorId={preset.creator.id}
              onDeleted={() => {
                removeFromCache(preset.id);
                router.push("/presets");
              }}
            />
          }
        />
      }
      aside={aside}
      actions={
        <DetailActionBar
          primary={
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/studio?preset=${preset.id}`} className={buttonClassName({ size: "lg", className: "h-14 rounded-full px-7 shadow-pop" })}>
                <WandSparkles size={18} aria-hidden /> {t("studio.openInStudio")}
              </Link>
              {/* "Bir promptla dene" (docs/history/228-*): pick a prompt that fits this preset, Studio opens with both. */}
              <button
                type="button"
                onClick={() => setTryPicker(true)}
                aria-haspopup="dialog"
                className={buttonClassName({ variant: "outline", size: "lg", className: "h-14 rounded-full px-6" })}
              >
                {t("presetTry.button")}
              </button>
            </div>
          }
          end={
            <>
              <EngageStatistics
                target={{ contentType: "preset", contentId: preset.id, likeCount: preset.likeCount, commentCount: preset.commentCount, saveCount: preset.saveCount }}
                size={20}
              />
              <EngageShare target={{ contentType: "preset", preset }} />
            </>
          }
        >
          <EngageLike id={preset.id} likeCount={preset.likeCount} contentType="preset" size={20} />
          <EngageCommentCount presetId={preset.id} baseCount={preset.commentCount} size={20} />
          <EngageSave presetId={preset.id} saveCount={preset.saveCount} size={20} />
        </DetailActionBar>
      }
    >
      <article className="min-w-0 space-y-8">
        {preset.description && <DetailLede>{preset.description}</DetailLede>}

        {tabItems.length > 1 && <Tabs items={tabItems} active={tab} onChange={setTab} ariaLabel={t("history.sectionsAria")} />}

        {tab === "history" && versions.length > 0 && <PresetHistoryPanel presetId={preset.id} versions={versions} isOwner={isOwn} />}

        {tab === "preset" && (<>
        <div className="flex flex-wrap items-start gap-3 rounded-[22px] border border-primary/20 bg-primary-soft/50 p-5 sm:p-6">
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
          </div>
        </div>

        {lightbox && preset.coverUrl && (
          <ImageLightbox images={[{ url: preset.coverUrl, alt: preset.title }]} initialIndex={0} onClose={() => setLightbox(false)} />
        )}

        <DetailSection title={t("preset.contentsTitle")}>
          {entries.length === 0 ? (
            <p className="rounded-[22px] border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("preset.noParameters")}</p>
          ) : (
            <dl className="grid overflow-hidden rounded-[22px] border border-border-soft bg-border-soft [gap:1px] sm:grid-cols-2">
              {entries.map((entry) => (
                <div key={entry.fieldId} className="flex items-baseline justify-between gap-3 bg-surface px-5 py-3.5">
                  <dt className="shrink-0 text-small text-text-muted">{entry.fieldLabel}</dt>
                  <dd className="min-w-0 truncate text-right text-small font-semibold text-text">{entry.valueLabel}</dd>
                </div>
              ))}
            </dl>
          )}
        </DetailSection>

        </>)}

        <DetailComments>
          <EngageComments target={{ presetId: preset.id }} highlightCommentId={highlightCommentId} headless />
        </DetailComments>
        <VersionRestoreToast contentId={preset.id} />
        {tryPicker && (
          <StudioSourcePicker
            kind="prompt"
            fitFor={preset}
            onPick={(key) => router.push(`/studio?prompt=${encodeURIComponent(key)}&preset=${encodeURIComponent(preset.id)}`)}
            onClose={() => setTryPicker(false)}
          />
        )}
      </article>
    </DetailShell>
  );
}
