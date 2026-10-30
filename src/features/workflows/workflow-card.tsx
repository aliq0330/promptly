"use client";

import { ArrowRight, Workflow as WorkflowIcon } from "lucide-react";
import { workflowHref } from "@/lib/utils";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { PostTargetMenu, postMeta } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { Badge } from "@/components/ui/badge";
import { TextArt, TextArtTitle } from "@/features/content/text-art";
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

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={workflow.creator}
        meta={postMeta(workflow.creator.username, workflow.createdAt, language)}
        typeIcon={WorkflowIcon}
        titleInArt={!workflow.coverUrl}
        status={workflow.status === "draft" ? <Badge variant="warning">{t("workflow.draftBadge")}</Badge> : undefined}
        badges={
          <>
            <ContentTypePill icon={WorkflowIcon} label={t("workflow.singular")} detail={category} />
          </>
        }
        menu={<PostTargetMenu workflow={workflow} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />}
        art={
          workflow.coverUrl ? (
            <figure className="relative aspect-video w-full overflow-hidden bg-surface-soft">
              {/* eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover */}
              <img src={workflow.coverUrl} alt="" className="h-full w-full object-cover" />
              {workflow.media.length > 1 && (
                <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-caption font-semibold text-white">
                  {t("media.moreImagesBadge", { count: workflow.media.length - 1 })}
                </span>
              )}
            </figure>
          ) : (
            <TextArt seed={workflow.id}>
              <TextArtTitle>{workflow.title}</TextArtTitle>
              <span className="flex flex-wrap items-center gap-1.5">
                {workflow.contentTypes.map((type, index) => {
                  const Icon = CONTENT_TYPE_META[type].icon;
                  return (
                    <span key={type} className="inline-flex items-center gap-1.5">
                      {index > 0 && <ArrowRight size={13} aria-hidden className="opacity-60" />}
                      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-current/10 px-2.5 text-caption font-semibold">
                        <Icon size={12} aria-hidden />
                        {t(CONTENT_TYPE_META[type].labelKey)}
                      </span>
                    </span>
                  );
                })}
              </span>
              <span className="text-caption opacity-70">{t("workflow.stepCount", { count: String(workflow.stepCount) })}</span>
            </TextArt>
          )
        }
        title={<ContentCardTitle href={href} title={workflow.title} />}
        footer={<PromptCardFooter workflow={workflow} />}
      />
    </ContentCard>
  );
}
