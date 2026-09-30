"use client";

import { ArrowRight, Workflow as WorkflowIcon } from "lucide-react";
import { workflowHref } from "@/lib/utils";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ToolChips } from "@/features/content/tool-chips";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { PostHeader } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import { categoryLabel } from "./step-meta";
import type { Workflow } from "@/types";

/**
 * WorkflowCard — the same ContentCard shell, PostHeader (author, time,
 * three-dot menu), type line and Beğeni · Yorum · Kaydet · Paylaş footer as
 * PromptCard/GeneratorCard; only the middle block differs: a compact "steps"
 * panel (same surface as the prompt block) summarizing how many steps the
 * workflow has and which content types it chains, plus the tool chips.
 */
export function WorkflowCard({
  workflow,
  onDeleted,
  collectionRemoval,
}: {
  workflow: Workflow;
  onDeleted?: () => void;
  /** Same "kaydedilenlerden kaldır"/"koleksiyondan kaldır" menu entry a prompt/generator card gets inside a collection the viewer owns. */
  collectionRemoval?: { isDefault: boolean; onRemove: () => Promise<void> };
}) {
  const { t, language } = useTranslation();
  const href = workflowHref(workflow);
  const category = categoryLabel(workflow.contentTypes, workflow.category, language);

  return (
    <ContentCard href={href}>
      <ContentCardBody>
        <PostHeader workflow={workflow} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <ContentTypeLabel icon={WorkflowIcon} label={t("workflow.singular")} detail={category} />
            {workflow.status === "draft" && <Badge variant="warning">{t("workflow.draftBadge")}</Badge>}
          </div>
          <ContentCardTitle href={href} title={workflow.title} description={workflow.description} />
        </div>

        <div className="flex items-center gap-3 rounded-md border border-border-soft bg-surface-soft p-2.5">
          {workflow.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover
            <img src={workflow.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-sm object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
              <WorkflowIcon size={20} strokeWidth={1.75} />
            </span>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-label font-medium text-text">
              {t("workflow.stepCount", { count: String(workflow.stepCount) })}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {workflow.contentTypes.map((type) => {
                const Icon = CONTENT_TYPE_META[type].icon;
                return (
                  <span key={type} className="inline-flex h-5 items-center gap-1 rounded-full bg-surface px-2 text-caption font-medium text-text-secondary">
                    <Icon size={10} />
                    {t(CONTENT_TYPE_META[type].labelKey)}
                  </span>
                );
              })}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-sm bg-surface px-2 py-1 text-caption font-semibold text-primary shadow-xs transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
            {t("workflow.view")}
            <ArrowRight size={12} />
          </span>
        </div>

        <ToolChips refs={workflow.tools} />
      </ContentCardBody>

      <PromptCardFooter workflow={workflow} />
    </ContentCard>
  );
}
