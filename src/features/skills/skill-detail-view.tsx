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
import { CodeBlock } from "@/components/ui/code-block";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useAuth } from "@/features/auth/auth-provider";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { AsideSection, DetailActionBar, DetailArtPlaceholder, DetailAside, DetailBand, DetailByline, DetailLede, DetailSection, DetailShell, DetailTitle } from "@/features/content/detail-parts";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { FollowButton } from "@/features/profile/follow-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_CATEGORY_LABEL, SKILL_COMPAT_LABEL, SKILL_LICENSE_LABEL, skillLabelText } from "@/lib/skills/categories";
import { deleteSkill, fetchSkillById } from "@/lib/supabase/skills";
import { formatRelativeTime } from "@/lib/utils";
import { downloadSkillMd, skillMdFor } from "./skill-download";
import type { Skill } from "@/types";

/**
 * `/skills/local?id=…` — Skill detay sayfası (Albüm düzeni, çekirdek dilim). Birincil eylem "SKILL.md indir". Talimat düz metin olarak
 * gösterilir (güvenli Markdown görüntüleyici sonraki dilimdir). Beğeni/yorum/kaydet/İstatistik/Paylaş çubuğu, Dosyalar ve Sürümler
 * sekmeleri sonraki dilimlerdir (`docs/yapilacaklar.md`).
 */
export function SkillDetailView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const id = useSearchParams().get("id");
  const { user } = useAuth();
  const [skill, setSkill] = useState<Skill | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  usePageTitle(skill?.title);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchSkillById(id).then((result) => !cancelled && setSkill(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <NotFoundBlock title={t("skill.notFoundTitle")} description={t("common.brokenLinkHint")} />;
  if (skill === undefined) return <DetailSkeleton />;
  if (!skill) return <NotFoundBlock title={t("skill.notFoundTitle")} description={t("skill.notFoundBody")} />;

  const isOwn = user?.id === skill.creator.id;
  const category = skill.category ? t(SKILL_CATEGORY_LABEL[skill.category]) : null;
  const tools = skill.compat.map((tool) => skillLabelText(SKILL_COMPAT_LABEL[tool], t)).join(", ");

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
        />
      }
      aside={aside}
      actions={
        <DetailActionBar
          primary={
            <button type="button" onClick={() => downloadSkillMd(skill)} data-skill-download="" className={buttonClassName({ size: "lg", className: "h-14 rounded-full px-7 shadow-pop" })}>
              <Download size={18} aria-hidden /> {t("skill.download")}
            </button>
          }
        >
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

        <DetailSection title={t("skill.instructionsTitle")}>
          {skill.instructions.trim() ? (
            <pre className="prompt-text whitespace-pre-wrap break-words rounded-xl border border-border-soft bg-surface-soft px-5 py-4 text-small text-text">{skill.instructions}</pre>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("skill.noInstructions")}</p>
          )}
        </DetailSection>

        <DetailSection title={t("skill.skillMdTitle")}>
          <p className="mb-3 text-small text-text-muted">{t("skill.skillMdHint")}</p>
          <CodeBlock text={skillMdFor(skill)} label={t("skill.skillMdLabel")} />
        </DetailSection>
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
