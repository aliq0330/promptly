"use client";

import Link from "next/link";
import { ArrowRight, Play, Workflow as WorkflowIcon } from "lucide-react";
import { workflowHref } from "@/lib/utils";
import { CARD_PRIMARY_CLASS, ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { AnnouncedChip } from "@/features/communities/announced-chip";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { PostTargetMenu, postMeta } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import { categoryLabel } from "./step-meta";
import type { Workflow } from "@/types";
import { ReactionSummary } from "@/features/reactions/reaction-summary";

/**
 * WorkflowCard — the Albüm card (`ContentCardPost`, docs/history/202-*) like PromptCard; its art is the cover (if any) or
 * a "steps" tile (how many steps, which content types it chains), its big action "Çalıştır" opens the detail page straight
 * in the step-by-step run (`?run=1`).
 */
export function WorkflowCard({
  workflow,
  onDeleted,
  collectionRemoval,
}: {
  workflow: Workflow;
  onDeleted?: () => void;
  /** Same "kaydedilenlerden kaldır"/"koleksiyondan kaldır" menu entry a prompt/generator card gets inside a collection the viewer owns. */
  collectionRemoval?: { onRemove: () => Promise<void> };
}) {
  const { t, language } = useTranslation();
  const href = workflowHref(workflow);
  const category = categoryLabel(workflow.contentTypes, workflow.category, language);

  return (
    <ContentCard href={href}>
      <ContentCardPost
        author={workflow.creator}
        meta={postMeta(workflow.creator.username, workflow.createdAt, language)}
        badges={
          <>
            <ContentTypePill icon={WorkflowIcon} label={t("workflow.singular")} detail={category} />
            <AnnouncedChip kind="workflow" id={workflow.id} />
            {workflow.status === "draft" && <Badge variant="warning">{t("workflow.draftBadge")}</Badge>}
          </>
        }
        menu={<PostTargetMenu workflow={workflow} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />}
        art={
          workflow.coverUrl ? (
            <figure data-card-media className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-soft shadow-pop">
              {/* eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover */}
              <img src={workflow.coverUrl} alt="" className="h-full w-full object-cover" />
              {workflow.media.length > 1 && (
                <span className="absolute bottom-2 right-2 rounded-xs bg-black/60 px-1.5 py-0.5 text-caption font-medium text-white">
                  {t("media.moreImagesBadge", { count: workflow.media.length - 1 })}
                </span>
              )}
            </figure>
          ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-lg bg-surface px-4 py-5 text-center shadow-pop">
              <span className="text-label font-semibold text-text">{t("workflow.stepCount", { count: String(workflow.stepCount) })}</span>
              <span className="flex flex-wrap items-center justify-center gap-1.5">
                {workflow.contentTypes.map((type, index) => {
                  const Icon = CONTENT_TYPE_META[type].icon;
                  return (
                    <span key={type} className="inline-flex items-center gap-1.5">
                      {index > 0 && <ArrowRight size={13} aria-hidden className="text-text-muted" />}
                      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-soft px-2.5 text-caption font-semibold text-primary">
                        <Icon size={12} aria-hidden />
                        {t(CONTENT_TYPE_META[type].labelKey)}
                      </span>
                    </span>
                  );
                })}
              </span>
            </div>
          )
        }
        // eslint-disable-next-line @next/next/no-img-element -- decorative tint of the same cover
        backdrop={workflow.coverUrl ? <img src={workflow.coverUrl} alt="" className="h-full w-full object-cover" /> : undefined}
        title={<ContentCardTitle href={href} title={workflow.title} />}
        primary={
          workflow.stepCount > 0 ? (
            <Link href={`${href}&run=1`} className={CARD_PRIMARY_CLASS}>
              <Play size={14} aria-hidden fill="currentColor" />
              {t("run.button")}
            </Link>
          ) : undefined
        }
        reactions={<ReactionSummary contentType="workflow" id={workflow.id} likeCount={workflow.likeCount} />}
        footer={<PromptCardFooter workflow={workflow} />}
      />
    </ContentCard>
  );
}
