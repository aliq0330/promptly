"use client";

import Link from "next/link";
import { Plus, Workflow as WorkflowIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { buttonClassName } from "@/components/ui/button";
import { useRealWorkflows } from "./real-workflows-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { WorkflowCard } from "./workflow-card";

export function WorkflowsListView() {
  const { t } = useTranslation();
  const { realWorkflows: workflows, loading } = useRealWorkflows();

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={t("nav.workflows")}
        icon={WorkflowIcon}
        title={t("workflow.pageTitle")}
        description={t("workflow.pageDescription")}
        actions={
          <Link href="/workflows/create" className={buttonClassName({ size: "md" })}>
            <Plus size={16} />
            {t("workflow.create")}
          </Link>
        }
      />
      {loading && workflows.length === 0 ? (
        <PromptCardSkeletonGrid count={3} />
      ) : workflows.length === 0 ? (
        <EmptyState icon={WorkflowIcon} title={t("workflow.noneYetTitle")} description={t("workflow.noneYetBody")} />
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="mb-3 break-inside-avoid sm:mb-4">
              <WorkflowCard workflow={workflow} />
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
