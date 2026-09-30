"use client";

import { Workflow as WorkflowIcon } from "lucide-react";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ToolChips } from "@/features/content/tool-chips";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import { categoryLabel } from "./step-meta";
import type { Workflow } from "@/types";

export function workflowHref(workflow: Pick<Workflow, "id">): string {
  return `/workflows/local?id=${workflow.id}`;
}

export function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const { t, language } = useTranslation();
  const href = workflowHref(workflow);
  const category = categoryLabel(workflow.contentTypes, workflow.category, language);
  return (
    <ContentCard href={href}>
      {workflow.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- real local data-URL cover
        <img src={workflow.coverUrl} alt="" className="aspect-video w-full rounded-t-lg object-cover" />
      )}
      <ContentCardBody>
        <div className="flex items-center justify-between gap-2">
          <ContentTypeLabel icon={WorkflowIcon} label={t("workflow.singular")} detail={category} />
          {workflow.status === "draft" && <Badge variant="warning">{t("workflow.draftBadge")}</Badge>}
        </div>
        <ContentCardTitle href={href} title={workflow.title} description={workflow.description} />
        <div className="relative z-10 flex flex-wrap items-center gap-1.5">
          {workflow.contentTypes.map((type) => {
            const Icon = CONTENT_TYPE_META[type].icon;
            return (
              <span key={type} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-secondary">
                <Icon size={11} />
                {t(CONTENT_TYPE_META[type].labelKey)}
              </span>
            );
          })}
          <span className="text-caption text-text-muted">{t("workflow.stepCount", { count: String(workflow.stepCount) })}</span>
        </div>
        <ToolChips refs={workflow.tools} />
        <p className="text-caption text-text-muted">@{workflow.creator.username}</p>
      </ContentCardBody>
    </ContentCard>
  );
}
