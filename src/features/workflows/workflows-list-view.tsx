"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Workflow as WorkflowIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { buttonClassName } from "@/components/ui/button";
import { fetchRecentWorkflows } from "@/lib/supabase/workflows";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Workflow } from "@/types";
import { WorkflowCard } from "./workflow-card";

export function WorkflowsListView() {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  useEffect(() => {
    fetchRecentWorkflows().then(setWorkflows);
  }, []);

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
      {workflows === null ? (
        <PromptCardSkeletonGrid count={3} />
      ) : workflows.length === 0 ? (
        <EmptyState icon={WorkflowIcon} title={t("workflow.noneYetTitle")} description={t("workflow.noneYetBody")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
