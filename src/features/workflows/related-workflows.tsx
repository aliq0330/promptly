"use client";

import { Workflow as WorkflowIcon } from "lucide-react";
import { AsideSection } from "@/features/content/detail-parts";
import { RelatedCards, RelatedCardsSkeleton } from "@/features/content/related-cards";
import { useRelated } from "@/features/content/use-related";
import { fetchRelatedWorkflows } from "@/lib/supabase/workflows";
import { workflowHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Workflow } from "@/types";

/**
 * "Benzer workflow'lar" — chosen by the database from the source workflow itself
 * (`fetchRelatedWorkflows`: shared tags, then same category; visible workflows
 * only), same rule and look as `RelatedPrompts`. Skeleton while loading; renders
 * nothing when empty or when the request fails.
 */
export function RelatedWorkflows({ workflow, limit = 4 }: { workflow: Workflow; limit?: number }) {
  const { t } = useTranslation();
  const { loading, failed, items } = useRelated(workflow.id, () => fetchRelatedWorkflows(workflow.id, limit));

  if (failed || (!loading && items.length === 0)) return null;

  return (
    <AsideSection id="workflow-similar-title" title={t("workflow.similar")} href="/workflows">
      {loading ? (
        <RelatedCardsSkeleton count={limit} />
      ) : (
        <RelatedCards
          items={items.map((item) => ({
            id: item.id,
            href: workflowHref(item),
            title: item.title,
            meta: `${t("workflow.stepCount", { count: String(item.stepCount) })} · ${item.creator.displayName}`,
            icon: WorkflowIcon,
            image: item.media[0] ? { url: item.media[0].url, alt: item.media[0].alt } : null,
          }))}
        />
      )}
    </AsideSection>
  );
}
