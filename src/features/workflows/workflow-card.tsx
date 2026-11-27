"use client";

import { ArrowRight } from "@/components/icons/arrow-right";
import { Bookmark } from "@/components/icons/bookmark";
import { Heart } from "@/components/icons/heart";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { formatRelativeTime, workflowHref } from "@/lib/utils";
import { ContentCard, ContentCardPost, ContentCardTitle, useRowsLayout } from "@/features/content/content-card";
import { WorkflowGraphArt } from "@/features/content/card-art";
import { ContentTypePill } from "@/features/content/content-type-label";
import { RowMetrics } from "@/features/content/row-metrics";
import { CommunityOnlyBadge } from "@/features/content/community-only-badge";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { PostTargetMenu, postMeta } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { Badge } from "@/components/ui/badge";
import { TextArt } from "@/features/content/text-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import { categoryLabel } from "./step-meta";
import type { Workflow } from "@/types";

/**
 * WorkflowCard — the visual card (`ContentCardPost`, docs/history/266-*) like PromptCard; its art is the cover (if any) or
 * a "steps" tile (how many steps, which content types it chains). The step-by-step run (`?run=1`) starts on the detail page.
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
  const rows = useRowsLayout();

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={workflow.creator}
        meta={postMeta(workflow.creator.username, workflow.createdAt, language)}
        time={formatRelativeTime(workflow.createdAt, language)}
        editHref={`/workflows/create?edit=${workflow.id}`}
        ownMetrics={
          <RowMetrics
            items={[
              { icon: Heart, label: t("card.row.likes"), value: workflow.likeCount },
              { icon: Bookmark, label: t("card.row.saves"), value: workflow.saveCount },
            ]}
          />
        }
        typeIcon={WorkflowIcon}
        status={workflow.status === "draft" ? <Badge variant="warning">{t("workflow.draftBadge")}</Badge> : undefined}
        badges={
          <>
            <ContentTypePill icon={WorkflowIcon} label={t("workflow.singular")} detail={category} />
            <CommunityOnlyBadge communityId={workflow.communityId} />
          </>
        }
        menu={<PostTargetMenu workflow={workflow} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />}
        art={
          workflow.coverUrl ? (
            <figure className="relative aspect-video w-full overflow-hidden bg-surface-soft">
              {/* eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover */}
              <img src={workflow.coverUrl} alt="" className="h-full w-full object-cover" />
              {workflow.media.length > 1 && (
                <span className="absolute left-2.5 top-2.5 rounded-xs bg-art-chip px-2 py-0.5 text-caption font-semibold text-on-art">
                  {t("media.moreImagesBadge", { count: workflow.media.length - 1 })}
                </span>
              )}
            </figure>
          ) : (
            <WorkflowGraphArt workflowId={workflow.id} square={rows} fallback={
            <TextArt seed={workflow.id}>
              <span className="flex flex-wrap items-center gap-1.5">
                {workflow.contentTypes.map((type, index) => {
                  const Icon = CONTENT_TYPE_META[type].icon;
                  return (
                    <span key={type} className="inline-flex items-center gap-1.5">
                      {index > 0 && <ArrowRight size={12} aria-hidden className="opacity-60" />}
                      <span className="inline-flex h-7 items-center gap-1 rounded-sm bg-current/10 px-2.5 text-caption font-semibold">
                        <Icon size={12} aria-hidden />
                        {t(CONTENT_TYPE_META[type].labelKey)}
                      </span>
                    </span>
                  );
                })}
              </span>
              {/* Akış 2.1 (docs/history/451-*): adımlar küçük kutular zinciri; sonuncusu (çıktı) vurgulu. Beşten fazlası "+N". */}
              <span className="flex items-center gap-1" aria-label={t("workflow.stepCount", { count: String(workflow.stepCount) })}>
                {Array.from({ length: Math.min(workflow.stepCount, 5) }, (_, index) => {
                  const lastShown = index === Math.min(workflow.stepCount, 5) - 1;
                  const type = workflow.contentTypes[Math.min(index, workflow.contentTypes.length - 1)];
                  const Icon = type ? CONTENT_TYPE_META[type].icon : WorkflowIcon;
                  return (
                    <span key={index} className="inline-flex items-center gap-1">
                      {index > 0 && <ArrowRight size={12} aria-hidden className="opacity-50" />}
                      <span className={lastShown ? "grid h-9 w-9 place-items-center rounded-md bg-current/15 ring-2 ring-current/40" : "grid h-9 w-9 place-items-center rounded-md bg-current/10"}>
                        <Icon size={16} aria-hidden />
                      </span>
                    </span>
                  );
                })}
                {workflow.stepCount > 5 && <span className="text-caption font-semibold opacity-70">+{workflow.stepCount - 5}</span>}
              </span>
              <span className="text-caption opacity-70">{t("workflow.stepCount", { count: String(workflow.stepCount) })}</span>
            </TextArt>
            } />
          )
        }
        title={<ContentCardTitle href={href} title={workflow.title} description={workflow.description} />}
        footer={<PromptCardFooter workflow={workflow} />}
      />
    </ContentCard>
  );
}
