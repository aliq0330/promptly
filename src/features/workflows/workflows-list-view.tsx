"use client";

import { GitBranch, Link2, ListPlus, Workflow as WorkflowIcon } from "lucide-react";
import { ContentListPage } from "@/features/content/content-list-page";
import { useRealWorkflows } from "./real-workflows-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchWorkflows } from "@/lib/supabase/workflows";
import { WorkflowCard } from "./workflow-card";

export function WorkflowsListView() {
  const { t } = useTranslation();
  const { realWorkflows: workflows, loading, hasMore, loadingMore, loadMore } = useRealWorkflows();
  return (
    <ContentListPage
      icon={WorkflowIcon}
      art="workflows"
      eyebrow={t("nav.workflows")}
      title={t("workflow.pageTitle")}
      description={t("workflow.pageDescription")}
      createHref="/workflows/create"
      createLabel={t("workflow.create")}
      steps={[
        { icon: ListPlus, titleKey: "workflow.step1Title", bodyKey: "workflow.step1Body" },
        { icon: Link2, titleKey: "workflow.step2Title", bodyKey: "workflow.step2Body" },
        { icon: GitBranch, titleKey: "workflow.step3Title", bodyKey: "workflow.step3Body" },
      ]}
      baseItems={workflows.map((w) => ({ ...w, contentType: null }))}
      loading={loading}
      search={searchWorkflows}
      matches={(item, value) =>
        (!value.contentType || item.contentTypes.includes(value.contentType)) &&
        (!value.category || item.category === value.category) &&
        (!value.subcategory || item.subcategory === value.subcategory)
      }
      renderItems={(items) => (
        <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
          {items.map((workflow) => (
            <div key={workflow.id} className="mb-3 break-inside-avoid sm:mb-4">
              <WorkflowCard workflow={workflow} />
            </div>
          ))}
        </div>
      )}
      focusKind="workflow"
      emptyTitle={t("workflow.noneYetTitle")}
      emptyBody={t("workflow.noneYetBody")}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
