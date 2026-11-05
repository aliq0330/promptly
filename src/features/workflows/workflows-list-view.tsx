"use client";

import { GitBranch } from "@/components/icons/git-branch";
import { Link2 } from "@/components/icons/link-2";
import { ListPlus } from "@/components/icons/list-plus";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { ContentListPage } from "@/features/content/content-list-page";
import { useRealWorkflowsList } from "./real-workflows-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchWorkflowsPage } from "@/lib/supabase/workflows";
import { WorkflowCard } from "./workflow-card";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";

export function WorkflowsListView() {
  const { t } = useTranslation();
  const { realWorkflows: workflows, loading, hasMore, loadingMore, loadMore } = useRealWorkflowsList();
  return (
    <ContentListPage
      icon={WorkflowIcon}
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
      search={searchWorkflowsPage}
      matches={(item, value) =>
        (!value.contentType || item.contentTypes.includes(value.contentType)) &&
        (!value.category || item.category === value.category) &&
        (!value.subcategory || item.subcategory === value.subcategory)
      }
      renderItems={(items) => (
        <ContentGrid>
          {items.map((workflow) => (
            <div key={workflow.id} className={CONTENT_GRID_ITEM_CLASS}>
              <WorkflowCard workflow={workflow} />
            </div>
          ))}
        </ContentGrid>
      )}
      searchPlaceholder={t("search.placeholderWorkflows")}
      emptyTitle={t("workflow.noneYetTitle")}
      emptyBody={t("workflow.noneYetBody")}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
