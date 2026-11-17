"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/components/layout/page-title";
import { Download } from "@/components/icons/download";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Button } from "@/components/ui/button";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Badge } from "@/components/ui/badge";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { AsideSection, DetailActionBar, DetailArtPlaceholder, DetailAside, DetailBand, DetailByline, DetailComments, DetailLede, DetailShell, DetailTags, DetailTitle } from "@/features/content/detail-parts";
import { DetailMetaCard } from "@/features/content/detail-meta-card";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { MenuItem } from "@/features/communities/dropdown-menu";
import { Copy } from "@/components/icons/copy";
import { EngageCommentCount, EngageComments, EngageLike, EngageReactionSummary, EngageSave, EngageShare, EngageStatistics } from "@/features/content/scoped-engagement";
import { FollowButton } from "@/features/profile/follow-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_COMPAT_LABEL, SKILL_LICENSE_LABEL, skillCategoryName, skillLabelText } from "@/lib/skills/categories";
import { formatBytes } from "@/lib/skills/paths";
import { SkillSpacesAside } from "@/features/spaces/public-spaces";
import { SkillTextBlock } from "./skill-text-block";
import { SkillCoverImage } from "./skill-cover";
import { fetchSkillTags } from "@/lib/supabase/skills";
import { fetchSkillVersions, recordSkillUse, type SkillVersion } from "@/lib/supabase/skill-package";
import { deleteSkill, fetchSkillById } from "@/lib/supabase/skills";
import { copyTextToClipboard, formatCount, formatRelativeTime } from "@/lib/utils";
import { SimilarSkills } from "./skill-aside-blocks";
import { SkillWorksVote } from "./skill-works-vote";
import { SkillQualitySection } from "./skill-quality-section";
import { RelationMapRow } from "@/features/relations/relation-map-link";
import { SkillDetailCover } from "./skill-cover-card";
import { SkillLinkedSkills } from "./skill-links-section";
import { SkillInstallSection } from "./skill-install-section";
import { downloadSkillExchange, downloadSkillMd, downloadSkillMetadata, skillMdFor } from "./skill-download";
import { downloadSkillPackage, pickLatestVersion, SkillFilesSection, SkillRelatedSection, SkillVersionsSection } from "./skill-detail-parts";
import { SkillDownloadButton } from "./skill-download-button";
import { SkillMenu } from "./skill-menu";
import { useSkillCategories } from "./use-skill-categories";
import type { Skill, Tag } from "@/types";

type SkillTab = "text" | "files" | "versions";

/**
 * `/skills/local?id=…` — Skill detay sayfası (Albüm düzeni). Yayınlanmış bir sürüm varsa birincil eylem "ZIP indir" (değişmez paket, imzalı adres);
 * yoksa "SKILL.md indir" (alanlardan derlenir). Talimat güvenli Markdown görüntüleyicide (HTML üretmez) gösterilir, "Ham metin" ile düz görünür. Sürümler,
 * paket dosyaları (manifest) ve bağlı içerik bölümleri docs/history/389-*, 407-*. Beğeni/tepki, yorum, kaydet, İstatistik ve Paylaş çubuğu yayında + herkese açık Skill'dedir (390-*, 391-*).
 */
export function SkillDetailView({ skillId }: { skillId?: string } = {}) {
  const { t, language } = useTranslation();
  const categoryRows = useSkillCategories();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Topluluk gönderisi sayfası kimliği prop ile verir (`/communities/post/local?id=` adresindeki `id` gönderinin kimliğidir).
  const id = skillId ?? searchParams.get("id");
  const highlight = searchParams.get("hl");
  const highlightCommentId = highlight?.startsWith("comment:") ? highlight.slice("comment:".length) : null;
  const { user } = useAuth();
  const [skill, setSkill] = useState<Skill | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [tab, setTab] = useState<SkillTab>("text");
  const [reload, setReload] = useState(0);
  const [downloads, setDownloads] = useState(0);
  const [tags, setTags] = useState<Pick<Tag, "slug" | "label">[]>([]);
  usePageTitle(skill?.title);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchSkillById(id).then((result) => !cancelled && setSkill(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchSkillVersions(id)
      .then((list) => !cancelled && setVersions(list))
      .catch(() => !cancelled && setVersions([]));
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchSkillTags(id)
      .then((list) => !cancelled && setTags(list))
      .catch(() => !cancelled && setTags([]));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <NotFoundBlock title={t("skill.notFoundTitle")} description={t("common.brokenLinkHint")} />;
  if (skill === undefined) return <DetailSkeleton />;
  if (!skill) return <NotFoundBlock title={t("skill.notFoundTitle")} description={t("skill.notFoundBody")} />;

  const isOwn = user?.id === skill.creator.id;
  const category = skill.category ? skillCategoryName(skill.category, language, t, categoryRows) : null;
  const tools = skill.compat.map((tool) => skillLabelText(SKILL_COMPAT_LABEL[tool], t)).join(", ");

  const latest = pickLatestVersion(versions);
  // Yayınlanan sürümün talimatı DEĞİŞMEZDİR (docs/history/415-*): okuyucu (indirme, kopyalama, sayfa) yayınlanan metni ve sürümü görür; sahibin sonradan değiştirdiği çalışma kopyası yalnız sahibine görünür.
  // Anlık görüntüsü olmayan eski sürümde çalışma kopyasına düşülür.
  const snapshot = latest?.instructions ?? null;
  const hasPendingChanges = isOwn && snapshot !== null && snapshot.trim() !== skill.instructions.trim();
  const shown: Skill = isOwn ? skill : { ...skill, instructions: snapshot ?? skill.instructions, version: latest?.version ?? skill.version };
  const published = skill.status === "published" && skill.visibility === "public";
  const fileCount = latest?.manifest?.files?.length ?? 0;
  // Sekmeler prompt sayfasındaki gibidir (Prompt · Geçmiş · DNA): Talimat ve Dosyalar her zaman; Sürümler sürüm varsa (sahibine yeni sürüm için hep).
  const tabItems: TabItem<SkillTab>[] = [
    { key: "text", label: t("skill.tabs.text") },
    // Dosyalar her zaman var: yalnız SKILL.md olsa da ağaç görünür (docs/history/410-*). Sayı SKILL.md'yi de sayar (ağaçtaki dosya sayısı).
    { key: "files" as const, label: t("skill.tabs.files"), count: fileCount + 1 },
    ...(versions.length > 0 || isOwn ? [{ key: "versions" as const, label: t("skill.tabs.versions"), count: versions.length }] : []),
  ];
  const activeTab: SkillTab = tabItems.some((item) => item.key === tab) ? tab : "text";
  const infoLine = [
    tools || null,
    `v${shown.version}`,
    skillLabelText(SKILL_LICENSE_LABEL[skill.license], t),
    latest ? t("skill.detail.packageMeta", { files: String(latest.fileCount), size: formatBytes(latest.packageSize) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function primaryDownload() {
    if (!skill) return;
    setDownloadError(null);
    if (!latest) {
      downloadSkillMd(shown);
      void recordSkillUse(skill.id).then(() => setDownloads((n) => n + 1));
      return;
    }
    try {
      await downloadSkillPackage(skill.id, skill.slug, latest);
      // Kullanım kaydı arka planda yazılır (indirmeyi bekletmez): oy hakkı kısa bir gecikmeyle yeniden sorulur.
      window.setTimeout(() => setDownloads((n) => n + 1), 1500);
    } catch {
      setDownloadError(t("skill.detail.downloadFailed"));
    }
  }

  async function confirmDeletion() {
    if (!user || !skill) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSkill(skill.id, user.id);
      router.push("/skills");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("skill.error.delete"));
      setDeleting(false);
    }
  }

  const aside = (
    <DetailAside>
      <AsideSection id="detail-about-title" title={t("profile.tabAbout")} bare>
        <DetailMetaCard
          toolLabel={t("skill.compat")}
          toolRefs={null}
          fallbackTool={tools || undefined}
          hasChips={Boolean(category) || tags.length > 0}
          quoteCount={skill.quoteCount ?? 0}
          footer={published ? <RelationMapRow kind="skill" id={skill.id} /> : undefined}
        >
          {category && <span className="inline-flex h-7 items-center rounded-full border border-border-soft bg-surface-soft px-2.5 text-caption font-medium text-text-secondary">{category}</span>}
          <DetailTags className="contents" tags={tags.map((tag) => ({ ...tag }) as Tag)} />
        </DetailMetaCard>
        {/* "Skill bilgisi" kartı Hakkında'ya katıldı (docs/history/409-*): prompt sayfasında ikinci bir bilgi kartı yoktur. */}
        <dl className="divide-y divide-border-soft border-t border-border-soft text-small" data-skill-info="">
          <InfoRow label={t("skill.version")} value={shown.version} />
          <InfoRow label={t("skill.license")} value={skillLabelText(SKILL_LICENSE_LABEL[skill.license], t)} />
          <InfoRow label={t("skill.updated")} value={formatRelativeTime(skill.updatedAt, language)} />
        </dl>
      </AsideSection>
      <SkillQualitySection skill={skill} hasPackage={Boolean(latest)} aside />
      <SkillLinkedSkills skillId={skill.id} aside />
      <SkillRelatedSection skillId={skill.id} aside />
      <SimilarSkills skillId={skill.id} />
      {published && <SkillSpacesAside skillId={skill.id} />}
    </DetailAside>
  );

  return (
    <DetailShell
      band={
        <DetailBand
          backdrop={skill.coverPath ? <SkillCoverImage path={skill.coverPath} className="h-full w-full object-cover" /> : undefined}
          art={skill.coverPath ? <SkillDetailCover path={skill.coverPath} fallback={<DetailArtPlaceholder icon={GraduationCap} />} /> : <DetailArtPlaceholder icon={GraduationCap} />}
          kicker={
            <div className="flex flex-wrap items-center gap-2">
              <ContentTypeLabel icon={GraduationCap} label={t("skill.singular")} detail={category} />
              {skill.status === "draft" ? <Badge variant="warning">{t("skill.draftBadge")}</Badge> : skill.visibility === "private" ? <Badge variant="neutral">{t("skill.privateBadge")}</Badge> : null}
            </div>
          }
          title={<DetailTitle>{skill.title || t("skill.untitled")}</DetailTitle>}
          byline={
            <DetailByline
              person={skill.creator}
              createdAt={skill.createdAt}
              language={language}
              meta={skill.useCount > 0 ? (skill.useCount === 1 ? t("prompt.usedOnce") : t("prompt.usedCount", { count: formatCount(skill.useCount) })) : undefined}
              follow={!isOwn && <FollowButton user={skill.creator} />}
            />
          }
          menu={<SkillMenu skill={skill} isOwn={isOwn} signedIn={Boolean(user)} onDelete={() => setConfirmDelete(true)} />}
        />
      }
      aside={aside}
      actions={
        <DetailActionBar
          below={skill.status === "published" && skill.visibility === "public" ? <EngageReactionSummary id={skill.id} likeCount={skill.likeCount} contentType="skill" /> : undefined}
          end={
            skill.status === "published" && skill.visibility === "public" ? (
              <>
                <EngageStatistics target={{ contentType: "skill", contentId: skill.id, likeCount: skill.likeCount, commentCount: skill.commentCount, saveCount: skill.saveCount }} size={20} />
                <EngageShare target={{ contentType: "skill", skill }} />
              </>
            ) : undefined
          }
        >
          {skill.status === "published" && skill.visibility === "public" && (
            <>
              <EngageLike id={skill.id} likeCount={skill.likeCount} contentType="skill" size={20} />
              <EngageCommentCount skillId={skill.id} baseCount={skill.commentCount} size={20} />
              <EngageSave skillId={skill.id} saveCount={skill.saveCount} size={20} />
            </>
          )}
        </DetailActionBar>
      }
    >
      <article className="min-w-0 space-y-8">
        <div className="space-y-3 empty:hidden">
          {skill.summary && <DetailLede>{skill.summary}</DetailLede>}
          <p className="text-caption text-text-muted" data-skill-no-run="">
            {t("skill.noRunNotice")}
          </p>
        </div>

        {tabItems.length > 1 && <Tabs items={tabItems} active={activeTab} onChange={setTab} ariaLabel={t("skill.tabs.aria")} />}

        {/* Talimat sekmesinde başlık yok: sekme adı zaten bu (docs/history/410-*). */}
        {activeTab === "text" && (
          <>
            <section id="skill-text" aria-label={t("skill.instructionsTitle")} className="scroll-mt-24 space-y-4">
              {hasPendingChanges && (
                <InlineAlert tone="info" data-skill-pending-changes="">
                  {t("skill.detail.unpublishedChanges", { version: latest?.version ?? "" })}
                </InlineAlert>
              )}
              <SkillTextBlock skillMd={skillMdFor(shown)} instructions={shown.instructions} info={infoLine} />
              {/* Eylemler bloğun altında, prompt'taki Kopyala · Çalıştır satırı gibi (docs/history/409-*). */}
              <div className="mt-4 flex flex-wrap items-center gap-2" data-skill-actions="">
                <SkillDownloadButton label={latest ? t("skill.detail.downloadZip", { version: latest.version }) : t("skill.download")} onPrimary={() => void primaryDownload()}>
                  {(close) => (
                    <>
                      <MenuItem icon={<Download size={16} />} label={t("skill.detail.downloadMd")} onClick={() => { close(); downloadSkillMd(shown); void recordSkillUse(skill.id); }} />
                      <MenuItem icon={<Download size={16} />} label={t("skill.detail.downloadJson")} onClick={() => { close(); downloadSkillMetadata(shown); }} />
                      <MenuItem icon={<Download size={16} />} label={t("skill.detail.downloadExchange")} onClick={() => { close(); downloadSkillExchange(shown); }} />
                    </>
                  )}
                </SkillDownloadButton>
                <Button type="button" variant="outline" className="h-11" data-skill-copy="" onClick={() => void copyTextToClipboard(skillMdFor(shown)).then((ok) => setCopyNote(ok ? t("common.copied") : t("skill.detail.copyFailed")))}>
                  <Copy size={16} aria-hidden /> {t("skill.detail.copyMd")}
                </Button>
              </div>
              {copyNote && (
                <p role="status" className="mt-2 text-small text-text-muted" data-skill-copy-note="">
                  {copyNote}
                </p>
              )}
              {downloadError && (
                <p role="alert" className="mt-2 text-small text-danger">
                  {downloadError}
                </p>
              )}
            </section>

            {published && <SkillInstallSection skill={skill} zipFileName={latest ? `${skill.slug}-${latest.version}.zip` : null} />}

            {published && <SkillWorksVote skillId={skill.id} isOwn={isOwn} justDownloaded={downloads} />}
          </>
        )}

        {activeTab === "files" && <SkillFilesSection key={latest?.id ?? "draft"} version={latest} skillMd={skillMdFor(shown)} onDownload={() => void primaryDownload()} />}

        {activeTab === "versions" && <SkillVersionsSection skillId={skill.id} slug={skill.slug} versions={versions} isOwn={isOwn} onChanged={() => setReload((value) => value + 1)} />}

        {published ? (
          <DetailComments>
            <EngageComments target={{ skillId: skill.id }} ownerId={skill.creator.id} highlightCommentId={highlightCommentId} headless />
          </DetailComments>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-small text-text-muted" data-skill-social-off="">
            {t("skill.social.unpublished")}
          </p>
        )}
      </article>

      {confirmDelete && (
        <ConfirmDialog
          id="skill-delete"
          title={t("skill.deleteTitle")}
          body={t("skill.deleteBody", { title: skill.title || t("skill.untitled") })}
          confirmLabel={t("skill.delete")}
          danger
          busy={deleting}
          error={deleteError}
          onConfirm={() => void confirmDeletion()}
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
        />
      )}
    </DetailShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="truncate text-right font-semibold text-text">{value}</dd>
    </div>
  );
}
