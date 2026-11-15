"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/components/layout/page-title";
import { Download } from "@/components/icons/download";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Pencil } from "@/components/icons/pencil";
import { Trash2 } from "@/components/icons/trash-2";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useAuth } from "@/features/auth/auth-provider";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { AsideSection, DetailActionBar, DetailArtPlaceholder, DetailAside, DetailBand, DetailByline, DetailComments, DetailLede, DetailSection, DetailShell, DetailTitle } from "@/features/content/detail-parts";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { DropdownMenu } from "@/features/communities/dropdown-menu";
import { EngageCommentCount, EngageComments, EngageLike, EngageReactionSummary, EngageSave, EngageShare, EngageStatistics } from "@/features/content/scoped-engagement";
import { ReportButton } from "@/features/moderation/report-button";
import { FollowButton } from "@/features/profile/follow-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_CATEGORY_LABEL, SKILL_COMPAT_LABEL, SKILL_LICENSE_LABEL, skillLabelText } from "@/lib/skills/categories";
import { fetchSkillVersions, recordSkillUse, type SkillVersion } from "@/lib/supabase/skill-package";
import { deleteSkill, fetchSkillById } from "@/lib/supabase/skills";
import { formatRelativeTime } from "@/lib/utils";
import { MarkdownView } from "./markdown-view";
import { SimilarSkills } from "./skill-aside-blocks";
import { downloadSkillMd, skillMdFor } from "./skill-download";
import { downloadSkillPackage, pickLatestVersion, SkillFilesSection, SkillRelatedSection, SkillVersionsSection } from "./skill-detail-parts";
import type { Skill } from "@/types";

/**
 * `/skills/local?id=…` — Skill detay sayfası (Albüm düzeni). Yayınlanmış bir sürüm varsa birincil eylem "ZIP indir" (değişmez paket, imzalı adres);
 * yoksa "SKILL.md indir" (alanlardan derlenir). Talimat güvenli Markdown görüntüleyicide (HTML üretmez) gösterilir, "Ham metin" ile düz görünür. Sürümler,
 * paket dosyaları (manifest) ve bağlı içerik bölümleri docs/history/389-*. Beğeni/yorum/kaydet/İstatistik/Paylaş çubuğu sonraki dilimdir (`docs/yapilacaklar.md`).
 */
export function SkillDetailView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const highlight = searchParams.get("hl");
  const highlightCommentId = highlight?.startsWith("comment:") ? highlight.slice("comment:".length) : null;
  const { user } = useAuth();
  const [skill, setSkill] = useState<Skill | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [rawView, setRawView] = useState(false);
  const [reload, setReload] = useState(0);
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

  if (!id) return <NotFoundBlock title={t("skill.notFoundTitle")} description={t("common.brokenLinkHint")} />;
  if (skill === undefined) return <DetailSkeleton />;
  if (!skill) return <NotFoundBlock title={t("skill.notFoundTitle")} description={t("skill.notFoundBody")} />;

  const isOwn = user?.id === skill.creator.id;
  const category = skill.category ? t(SKILL_CATEGORY_LABEL[skill.category]) : null;
  const tools = skill.compat.map((tool) => skillLabelText(SKILL_COMPAT_LABEL[tool], t)).join(", ");

  const latest = pickLatestVersion(versions);

  async function primaryDownload() {
    if (!skill) return;
    setDownloadError(null);
    if (!latest) {
      downloadSkillMd(skill);
      void recordSkillUse(skill.id);
      return;
    }
    try {
      await downloadSkillPackage(skill.id, skill.slug, latest);
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
      <AsideSection id="skill-info-title" title={t("skill.aboutTitle")}>
        <dl className="divide-y divide-border-soft text-small">
          <InfoRow label={t("skill.version")} value={skill.version} />
          <InfoRow label={t("skill.license")} value={skillLabelText(SKILL_LICENSE_LABEL[skill.license], t)} />
          {category && <InfoRow label={t("skill.category")} value={category} />}
          {tools && <InfoRow label={t("skill.compat")} value={tools} />}
          <InfoRow label={t("skill.updated")} value={formatRelativeTime(skill.updatedAt, language)} />
        </dl>
      </AsideSection>
      <SimilarSkills skillId={skill.id} />
    </DetailAside>
  );

  return (
    <DetailShell
      band={
        <DetailBand
          art={<DetailArtPlaceholder icon={GraduationCap} />}
          kicker={
            <div className="flex flex-wrap items-center gap-2">
              <ContentTypeLabel icon={GraduationCap} label={t("skill.singular")} detail={category} />
              {skill.status === "draft" ? <Badge variant="warning">{t("skill.draftBadge")}</Badge> : skill.visibility === "private" ? <Badge variant="neutral">{t("skill.privateBadge")}</Badge> : null}
            </div>
          }
          title={<DetailTitle>{skill.title || t("skill.untitled")}</DetailTitle>}
          byline={<DetailByline person={skill.creator} createdAt={skill.createdAt} language={language} follow={!isOwn && <FollowButton user={skill.creator} />} />}
          menu={
            !isOwn && user ? (
              <span data-skill-menu="" className="relative z-10">
                <DropdownMenu label={t("skill.menu")}>
                  {() => (
                    <div className="px-4 py-2">
                      <ReportButton targetType="skill" targetId={skill.id} title={skill.title} subtitle={`@${skill.creator.username}`} />
                    </div>
                  )}
                </DropdownMenu>
              </span>
            ) : undefined
          }
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
          primary={
            <button type="button" onClick={() => void primaryDownload()} data-skill-download="" className={buttonClassName({ size: "lg", className: "h-14 rounded-full px-7 shadow-pop" })}>
              <Download size={18} aria-hidden /> {latest ? t("skill.detail.downloadZip", { version: latest.version }) : t("skill.download")}
            </button>
          }
        >
          {skill.status === "published" && skill.visibility === "public" && (
            <>
              <EngageLike id={skill.id} likeCount={skill.likeCount} contentType="skill" size={20} />
              <EngageCommentCount skillId={skill.id} baseCount={skill.commentCount} size={20} />
              <EngageSave skillId={skill.id} saveCount={skill.saveCount} size={20} />
            </>
          )}
          {latest && (
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => downloadSkillMd(skill)} data-skill-download-md="">
              <Download size={16} aria-hidden /> {t("skill.detail.downloadMd")}
            </Button>
          )}
          {isOwn ? (
            <>
              <Link href={`/skills/create?edit=${skill.id}`} data-skill-edit="" className={buttonClassName({ variant: "outline", size: "sm", className: "rounded-full" })}>
                <Pencil size={16} aria-hidden /> {t("skill.edit")}
              </Link>
              <button type="button" onClick={() => setConfirmDelete(true)} data-skill-delete="" className={buttonClassName({ variant: "outline", size: "sm", className: "rounded-full" })}>
                <Trash2 size={16} aria-hidden /> {t("skill.delete")}
              </button>
            </>
          ) : (
            <span className="text-small text-text-muted">{t("skill.cardVersion", { version: skill.version })}</span>
          )}
        </DetailActionBar>
      }
    >
      <article className="min-w-0 space-y-8">
        {skill.summary && <DetailLede>{skill.summary}</DetailLede>}

        <InlineAlert tone="info">{t("skill.noRunNotice")}</InlineAlert>

        {downloadError && (
          <p role="alert" className="text-small text-danger">
            {downloadError}
          </p>
        )}

        <DetailSection
          title={t("skill.instructionsTitle")}
          action={
            skill.instructions.trim() ? (
              <button type="button" onClick={() => setRawView((prev) => !prev)} aria-pressed={rawView} data-skill-raw-toggle="" className="rounded-full px-3 py-1 text-caption font-semibold text-primary hover:bg-primary-soft">
                {rawView ? t("skill.detail.renderedToggle") : t("skill.detail.rawToggle")}
              </button>
            ) : undefined
          }
        >
          {skill.instructions.trim() ? (
            rawView ? (
              <pre className="prompt-text whitespace-pre-wrap break-words rounded-xl border border-border-soft bg-surface-soft px-5 py-4 text-small text-text">{skill.instructions}</pre>
            ) : (
              <div className="rounded-xl border border-border-soft bg-surface px-5 py-4" data-skill-instructions="">
                <MarkdownView source={skill.instructions} />
              </div>
            )
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("skill.noInstructions")}</p>
          )}
        </DetailSection>

        {latest && <SkillFilesSection version={latest} />}

        <SkillRelatedSection skillId={skill.id} />

        <SkillVersionsSection skillId={skill.id} slug={skill.slug} versions={versions} isOwn={isOwn} onChanged={() => setReload((value) => value + 1)} />

        <DetailSection title={t("skill.skillMdTitle")}>
          <p className="mb-3 text-small text-text-muted">{t("skill.skillMdHint")}</p>
          <CodeBlock text={skillMdFor(skill)} label={t("skill.skillMdLabel")} />
        </DetailSection>

        {skill.status === "published" && skill.visibility === "public" ? (
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
