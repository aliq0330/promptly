"use client";

import { EngageCommentCount, EngageComments, EngageLike, EngageSave, EngageShare, EngageStatistics } from "@/features/content/scoped-engagement";
import { usePageTitle } from "@/components/layout/page-title";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, Workflow as WorkflowIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ToolChips } from "@/features/content/tool-chips";
import { DetailMetaCard } from "@/features/content/detail-meta-card";
import { CreatorSummary } from "@/features/profile/creator-summary";
import { FollowButton } from "@/features/profile/follow-button";
import { RelatedWorkflows } from "./related-workflows";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useAuth } from "@/features/auth/auth-provider";
import { PostMenu } from "@/features/prompts/post-menu";
import { RelationMapLink } from "@/features/relations/relation-map-link";
import { useRealWorkflows } from "./real-workflows-provider";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { fetchWorkflowById } from "@/lib/supabase/workflows";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  AsideSection,
  DetailActionBar,
  DetailAside,
  DetailByline,
  DetailComments,
  DetailLede,
  DetailShell,
  DetailTags,
  DetailTitle,
  Eyebrow,
} from "@/features/content/detail-parts";
import type { Workflow, WorkflowStep, WorkflowVersion } from "@/types";
import { categoryLabel } from "./step-meta";
import { WorkflowFlow } from "./workflow-flow";
import { WorkflowRunner } from "./workflow-runner";
import { WorkflowHistoryPanel } from "@/features/versions/content-history-panels";
import { VersionRestoreToast } from "@/features/versions/version-restore-toast";
import { fetchVersionsForWorkflow } from "@/lib/supabase/content-versions";

/** Read-only workflow page: who made it, what it's for, and the ordered steps — each links to its prompt / generator / request. */
export function WorkflowDetailView({ workflowId }: { workflowId?: string } = {}) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { removeFromCache } = useRealWorkflows();
  const { user } = useAuth();
  // `workflowId`: başvuru gönderisi sayfası aynı sayfayı gönderinin başvurduğu workflow ile çizer (adresteki `id` gönderinindir).
  const id = workflowId ?? searchParams.get("id");
  const [data, setData] = useState<
    { workflow: Workflow; steps: WorkflowStep[] } | null | undefined
  >(undefined);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  // Content (the default) or history — history exists only when the workflow has versions, owner included.
  const [tab, setTab] = useState<"workflow" | "history">("workflow");
  // "Akış" (the read-only flow) or "Adım adım" (the guided run); `?run=1` opens the run directly.
  const [view, setView] = useState<"flow" | "run">(searchParams.get("run") === "1" ? "run" : "flow");
  const stepsRef = useRef<HTMLElement>(null);
  usePageTitle(data?.workflow.title);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchWorkflowById(id).then((result) => !cancelled && setData(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchVersionsForWorkflow(id).then((result) => !cancelled && setVersions(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id)
    return (
      <NotFoundBlock
        title={t("workflow.notFoundTitle")}
        description={t("common.brokenLinkHint")}
      />
    );
  if (data === undefined) return <DetailSkeleton />;
  if (!data)
    return (
      <NotFoundBlock
        title={t("workflow.notFoundTitle")}
        description={t("workflow.notFoundBody")}
      />
    );

  const { workflow, steps } = data;
  const isOwn = user?.id === workflow.creator.id;
  const category = categoryLabel(
    workflow.contentTypes,
    workflow.category,
    language,
  );
  const highlight = searchParams.get("hl");
  const highlightCommentId = highlight?.startsWith("comment:")
    ? highlight.slice("comment:".length)
    : null;

  const tabItems: TabItem<"workflow" | "history">[] = [
    { key: "workflow", label: t("workflow.singular") },
    ...(versions.length > 0 ? [{ key: "history" as const, label: t("history.tab") }] : []),
  ];

  const aside = (
    <DetailAside>
      {/* Phones/tablets already show the creator (+ Follow) in the byline above. */}
      <div className="hidden xl:block">
        <CreatorSummary creator={workflow.creator} isOwn={isOwn} />
      </div>

      <AsideSection id="workflow-info-title" title={t("workflow.sidebarInfo")}>
        <dl className="divide-y divide-border-soft text-label">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-text-muted">{t("workflow.sidebarSteps")}</dt>
            <dd className="font-semibold tabular-nums text-text">{steps.length}</dd>
          </div>
          {category && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-text-muted">{t("workflow.sidebarType")}</dt>
              <dd className="truncate font-semibold text-text">{category}</dd>
            </div>
          )}
        </dl>
      </AsideSection>

      {workflow.tools.length > 0 && (
        <AsideSection id="workflow-tools-title" title={t("workflow.sidebarTools")} bare>
          <ToolChips refs={workflow.tools} />
        </AsideSection>
      )}

      <RelatedWorkflows workflow={workflow} />
    </DetailAside>
  );

  return (
    <DetailShell aside={aside}>
      <article className="min-w-0 space-y-6">
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <ContentTypeLabel icon={WorkflowIcon} label={t("workflow.singular")} detail={category} />
            <div className="flex items-center gap-2">
              {workflow.status === "draft" && <Badge variant="warning">{t("workflow.draftBadge")}</Badge>}
              <PostMenu
                workflowId={workflow.id}
                communityId={workflow.communityId}
                authorId={workflow.creator.id}
                onDeleted={() => {
                  removeFromCache(workflow.id);
                  router.push("/workflows");
                }}
              />
            </div>
          </div>
          <div className="space-y-3">
            <DetailTitle>{workflow.title}</DetailTitle>
            {workflow.description && <DetailLede>{workflow.description}</DetailLede>}
          </div>
          <DetailByline
            person={workflow.creator}
            createdAt={workflow.createdAt}
            language={language}
            // The creator card lives in the side column, which on phones/tablets stacks far below —
            // so there the byline carries the Follow button instead of repeating the whole card.
            trailing={!isOwn ? <FollowButton user={workflow.creator} className="xl:hidden" /> : undefined}
          />
        </header>

        <DetailActionBar trailing={<EngageShare target={{ contentType: "workflow", workflow }} label={t("common.share")} />}>
          <EngageLike id={workflow.id} likeCount={workflow.likeCount} contentType="workflow" size={18} />
          <EngageCommentCount workflowId={workflow.id} baseCount={workflow.commentCount} size={18} />
          <EngageSave workflowId={workflow.id} saveCount={workflow.saveCount} size={18} />
          <EngageStatistics target={{ contentType: "workflow", contentId: workflow.id, likeCount: workflow.likeCount, commentCount: workflow.commentCount, saveCount: workflow.saveCount }} size={18} label={t("statistics.title")} />
          <RelationMapLink kind="workflow" id={workflow.id} />
        </DetailActionBar>

        {tabItems.length > 1 && <Tabs items={tabItems} active={tab} onChange={setTab} ariaLabel={t("history.sectionsAria")} />}

        {tab === "history" && versions.length > 0 && <WorkflowHistoryPanel workflowId={workflow.id} versions={versions} isOwner={isOwn} />}

        {tab === "workflow" && (<>
        {workflow.coverUrl && (
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            aria-label={t("media.viewFullscreen")}
            className="relative block w-full overflow-hidden rounded-xl border border-border-soft shadow-card"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- real local data-URL cover */}
            <img src={workflow.coverUrl} alt="" className="aspect-video w-full object-cover" />
            {workflow.media.length > 1 && (
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-caption font-medium text-white">
                {t("media.moreImagesBadge", { count: workflow.media.length - 1 })}
              </span>
            )}
          </button>
        )}
        {workflow.media.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {workflow.media.slice(1).map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightboxIndex(index + 1)}
                aria-label={t("media.viewFullscreen")}
                className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border-soft"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail strip, same source list as the cover */}
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {lightboxIndex !== null && (
          <ImageLightbox
            images={workflow.media.map((item) => ({ url: item.url, alt: item.alt }))}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {workflow.contentTypes.map((type) => {
            const Icon = CONTENT_TYPE_META[type].icon;
            return (
              <span
                key={type}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-secondary"
              >
                <Icon size={11} />
                {t(CONTENT_TYPE_META[type].labelKey)}
              </span>
            );
          })}
          <span className="text-caption text-text-muted">{t("workflow.stepCount", { count: String(steps.length) })}</span>
        </div>
        {steps.length > 0 && (
          <Button
            size="sm"
            onClick={() => {
              setView("run");
              stepsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
          >
            <Play size={14} aria-hidden /> {t("workflow.run.start")}
          </Button>
        )}

        <DetailMetaCard toolLabel={t("tool.recommendedLabel")} toolRefs={workflow.tools} hasChips={workflow.tags.length > 0}>
          <DetailTags className="contents" tags={workflow.tags} />
        </DetailMetaCard>

        <section ref={stepsRef} aria-labelledby="workflow-steps-heading" className="scroll-mt-20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow as="h2" id="workflow-steps-heading">
              {t("workflow.viewStepsHeading")}
            </Eyebrow>
            {steps.length > 0 && (
              <Tabs
                variant="segmented"
                ariaLabel={t("workflow.run.viewAria")}
                active={view}
                onChange={setView}
                items={[
                  { key: "flow", label: t("workflow.run.viewFlow") },
                  { key: "run", label: t("workflow.run.viewRun") },
                ]}
              />
            )}
          </div>
          {view === "run" && steps.length > 0 ? <WorkflowRunner key={workflow.id} workflowId={workflow.id} steps={steps} /> : <WorkflowFlow steps={steps} />}
        </section>
        </>)}

        <DetailComments>
          <EngageComments target={{ workflowId: workflow.id }} highlightCommentId={highlightCommentId} />
        </DetailComments>
        <VersionRestoreToast contentId={workflow.id} />
      </article>
    </DetailShell>
  );
}
