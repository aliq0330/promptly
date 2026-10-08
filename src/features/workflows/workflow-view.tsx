"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Workflow as WorkflowIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ToolChips, ToolLine } from "@/features/content/tool-chips";
import { CreatorSummary } from "@/features/profile/creator-summary";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useAuth } from "@/features/auth/auth-provider";
import { PostMenu } from "@/features/prompts/post-menu";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { CommentSection } from "@/features/prompts/comment-section";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { useRealWorkflows } from "./real-workflows-provider";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { fetchWorkflowById } from "@/lib/supabase/workflows";
import { useTranslation } from "@/lib/i18n/language-provider";
import { workflowHref } from "@/lib/utils";
import {
  AsideLinkRow,
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
import type { Workflow, WorkflowStep } from "@/types";
import { categoryLabel } from "./step-meta";
import { WorkflowFlow } from "./workflow-flow";

/** Read-only workflow page: who made it, what it's for, and the ordered steps — each links to its prompt / generator / request. */
export function WorkflowDetailView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { removeFromCache, realWorkflows } = useRealWorkflows();
  const { user } = useAuth();
  const id = searchParams.get("id");
  const [data, setData] = useState<
    { workflow: Workflow; steps: WorkflowStep[] } | null | undefined
  >(undefined);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchWorkflowById(id).then((result) => !cancelled && setData(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const similar = useMemo(() => {
    const current = data?.workflow;
    if (!current) return [];
    const tagSet = new Set(current.tags.map((tag) => tag.slug));
    return realWorkflows
      .filter((w) => w.id !== current.id)
      .map((w) => ({
        w,
        score:
          w.tags.filter((tag) => tagSet.has(tag.slug)).length * 3 +
          (w.creator.id === current.creator.id ? 1 : 0) +
          w.contentTypes.filter((ct) => current.contentTypes.includes(ct))
            .length,
      }))
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ w }) => w);
  }, [data, realWorkflows]);

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
  const category = categoryLabel(
    workflow.contentTypes,
    workflow.category,
    language,
  );
  const highlight = searchParams.get("hl");
  const highlightCommentId = highlight?.startsWith("comment:")
    ? highlight.slice("comment:".length)
    : null;

  const aside = (
    <DetailAside>
      <CreatorSummary
        creator={workflow.creator}
        isOwn={user?.id === workflow.creator.id}
      />

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

      {similar.length > 0 && (
        <AsideSection id="workflow-similar-title" title={t("workflow.similar")}>
          <ul className="divide-y divide-border-soft">
            {similar.map((w) => (
              <li key={w.id}>
                <AsideLinkRow
                  href={workflowHref(w)}
                  icon={WorkflowIcon}
                  title={w.title}
                  meta={`${t("workflow.stepCount", { count: String(w.stepCount) })} · ${w.creator.displayName}`}
                />
              </li>
            ))}
          </ul>
        </AsideSection>
      )}
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
          <DetailByline person={workflow.creator} createdAt={workflow.createdAt} language={language} />
        </header>

        <DetailActionBar trailing={<ShareTriggerButton target={{ contentType: "workflow", workflow }} label={t("common.share")} />}>
          <LikeButton id={workflow.id} likeCount={workflow.likeCount} contentType="workflow" size={18} />
          <CommentCountLink workflowId={workflow.id} baseCount={workflow.commentCount} size={18} />
          <SaveButton workflowId={workflow.id} saveCount={workflow.saveCount} size={18} />
          <StatisticsButton target={{ contentType: "workflow", contentId: workflow.id, likeCount: workflow.likeCount, commentCount: workflow.commentCount, saveCount: workflow.saveCount }} size={18} label={t("statistics.title")} />
        </DetailActionBar>

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
        <ToolLine label={t("tool.recommendedLabel")} refs={workflow.tools} />

        <DetailTags tags={workflow.tags} />

        <section aria-labelledby="workflow-steps-heading" className="space-y-3">
          <Eyebrow as="h2" id="workflow-steps-heading">
            {t("workflow.viewStepsHeading")}
          </Eyebrow>
          <WorkflowFlow steps={steps} />
        </section>

        <DetailComments>
          <CommentSection target={{ workflowId: workflow.id }} highlightCommentId={highlightCommentId} />
        </DetailComments>
      </article>
    </DetailShell>
  );
}
