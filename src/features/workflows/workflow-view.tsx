"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ExternalLink,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ToolChips, ToolLine } from "@/features/content/tool-chips";
import { CreatorSummary } from "@/features/profile/creator-summary";
import { useAuth } from "@/features/auth/auth-provider";
import { PostMenu } from "@/features/prompts/post-menu";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { CommentSection } from "@/features/prompts/comment-section";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { useRealWorkflows } from "./real-workflows-provider";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { fetchWorkflowById } from "@/lib/supabase/workflows";
import { incomingLinks } from "@/lib/workflow-logic";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  cn,
  formatRelativeTime,
  profileHref,
  tagHref,
  workflowHref,
} from "@/lib/utils";
import type { Workflow, WorkflowStep } from "@/types";
import {
  categoryLabel,
  MEDIA_ICON,
  STEP_TYPE_META,
  stepSubtitle,
} from "./step-meta";

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

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <article className="min-w-0 space-y-5">
          <header className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <ContentTypeLabel
                icon={WorkflowIcon}
                label={t("workflow.singular")}
                detail={category}
              />
              <div className="flex items-center gap-2">
                {workflow.status === "draft" && (
                  <Badge variant="warning">{t("workflow.draftBadge")}</Badge>
                )}
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
            <h1 className="text-h1 font-semibold text-text">
              {workflow.title}
            </h1>
            {workflow.description && (
              <p className="max-w-2xl text-body text-text-secondary">
                {workflow.description}
              </p>
            )}
            <Link
              href={profileHref(workflow.creator)}
              className="group inline-flex max-w-full items-center gap-2.5 rounded-md"
            >
              <Avatar
                src={workflow.creator.avatarUrl}
                alt={workflow.creator.displayName}
                size={32}
              />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-label font-semibold text-text group-hover:text-primary">
                  {workflow.creator.displayName}
                </span>
                <span className="block truncate text-caption text-text-muted">
                  @{workflow.creator.username} ·{" "}
                  {formatRelativeTime(workflow.createdAt, language)}
                </span>
              </span>
            </Link>
          </header>

          <div className="flex flex-wrap items-center gap-0.5 border-y border-border-soft py-1.5">
            <LikeButton
              id={workflow.id}
              likeCount={workflow.likeCount}
              contentType="workflow"
              size={18}
            />
            <CommentCountLink
              workflowId={workflow.id}
              baseCount={workflow.commentCount}
              size={18}
            />
            <SaveButton workflowId={workflow.id} saveCount={workflow.saveCount} size={18} />
            <span className="ml-auto" />
            <ShareTriggerButton
              target={{ contentType: "workflow", workflow }}
              label={t("common.share")}
            />
          </div>

          {workflow.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- real local data-URL cover
            <img
              src={workflow.coverUrl}
              alt=""
              className="aspect-video w-full rounded-lg border border-border-soft object-cover"
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
            <span className="text-caption text-text-muted">
              {t("workflow.stepCount", { count: String(steps.length) })}
            </span>
          </div>
          <ToolLine label={t("tool.recommendedLabel")} refs={workflow.tools} />

          {workflow.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {workflow.tags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={tagHref(tag)}
                  className="inline-flex h-7 items-center rounded-full border border-border-soft bg-surface px-2.5 text-caption font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                >
                  #{tag.label}
                </Link>
              ))}
            </div>
          )}

          <section
            aria-labelledby="workflow-steps-heading"
            className="space-y-1"
          >
            <h2
              id="workflow-steps-heading"
              className="mb-3 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted"
            >
              {t("workflow.viewStepsHeading")}
            </h2>
            <ol>
              {steps.map((step, index) => {
                const meta = STEP_TYPE_META[step.stepType];
                const Icon = meta.icon;
                const c = step.content;
                const links = incomingLinks(steps, step.id);
                const openable = Boolean(c && c.published);
                const MediaIcon = c?.contentType
                  ? MEDIA_ICON[c.contentType]
                  : null;
                const body = (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text">
                          {step.title || t("workflow.untitledStep")}
                        </p>
                        <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-caption font-medium text-text-secondary">
                          <Icon size={11} className="shrink-0" />
                          <span className="truncate">
                            {[t(meta.labelKey), stepSubtitle(step, language)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </p>
                        {step.description && (
                          <p className="mt-1.5 text-small text-text-secondary">
                            {step.description}
                          </p>
                        )}
                        {c ? (
                          <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-caption text-text">
                            {MediaIcon && (
                              <MediaIcon
                                size={12}
                                className="shrink-0 text-text-muted"
                              />
                            )}
                            <span className="truncate font-medium">
                              {c.title}
                            </span>
                            <span className="shrink-0 text-text-muted">
                              @{c.authorUsername}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-1.5 text-caption text-text-muted">
                            {step.contentMissing
                              ? t("workflow.contentMissing")
                              : t("workflow.stepNoContentPublic")}
                          </p>
                        )}
                        {c && !c.published && (
                          <p className="mt-1 text-caption text-warning">
                            {t("workflow.unpublishedGenerator")}
                          </p>
                        )}
                        {(step.inputs.length > 0 ||
                          step.outputs.length > 0) && (
                          <div className="mt-2.5 grid gap-2 text-caption sm:grid-cols-2">
                            <div className="min-w-0">
                              <p className="mb-0.5 font-semibold uppercase tracking-[0.06em] text-text-muted">
                                {t("workflow.inputLabel")}
                              </p>
                              {step.inputs.length === 0 ? (
                                <p className="text-text-muted">—</p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {step.inputs.map((input) => {
                                    const link = links.find(
                                      (l) => l.input.id === input.id,
                                    );
                                    return (
                                      <li key={input.id} className="text-text">
                                        • {input.label}
                                        {link && (
                                          <span className="ml-1 inline-flex items-center gap-0.5 text-primary">
                                            <ArrowRight
                                              size={10}
                                              className="rotate-180"
                                              aria-hidden
                                            />
                                            {t("workflow.linkedFrom", {
                                              n: String(link.fromIndex + 1),
                                              label: link.output.label,
                                            })}
                                          </span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="mb-0.5 font-semibold uppercase tracking-[0.06em] text-text-muted">
                                {t("workflow.outputLabel")}
                              </p>
                              {step.outputs.length === 0 ? (
                                <p className="text-text-muted">—</p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {step.outputs.map((output) => (
                                    <li key={output.id} className="text-text">
                                      • {output.label}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {openable && (
                        <ExternalLink
                          size={14}
                          className="mt-1 shrink-0 text-text-muted"
                          aria-hidden
                        />
                      )}
                    </div>
                  </>
                );
                return (
                  <li key={step.id}>
                    {openable ? (
                      <Link
                        href={c!.href}
                        className={cn(
                          "block rounded-lg border border-border-soft bg-surface p-3 shadow-card transition-[border-color,box-shadow] duration-200 ease-soft hover:border-border hover:shadow-card-hover",
                        )}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="rounded-lg border border-border-soft bg-surface p-3 shadow-card">
                        {body}
                      </div>
                    )}
                    {index < steps.length - 1 && (
                      <div
                        className="flex justify-center py-1 text-border-strong"
                        aria-hidden
                      >
                        <ArrowDown size={16} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section
            id="comments"
            className="scroll-mt-20 rounded-lg border border-border-soft bg-surface p-4 sm:p-5"
          >
            <CommentSection
              target={{ workflowId: workflow.id }}
              highlightCommentId={highlightCommentId}
            />
          </section>
        </article>

        <aside className="mt-6 space-y-5 lg:sticky lg:top-24 lg:mt-0 lg:self-start">
          <CreatorSummary
            creator={workflow.creator}
            isOwn={user?.id === workflow.creator.id}
          />

          <section aria-labelledby="workflow-info-title" className="space-y-2">
            <h2
              id="workflow-info-title"
              className="px-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted"
            >
              {t("workflow.sidebarInfo")}
            </h2>
            <dl className="divide-y divide-border-soft overflow-hidden rounded-lg border border-border-soft bg-surface text-label">
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-text-muted">
                  {t("workflow.sidebarSteps")}
                </dt>
                <dd className="font-semibold text-text">{steps.length}</dd>
              </div>
              {category && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <dt className="text-text-muted">
                    {t("workflow.sidebarType")}
                  </dt>
                  <dd className="truncate font-semibold text-text">
                    {category}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {workflow.tools.length > 0 && (
            <section
              aria-labelledby="workflow-tools-title"
              className="space-y-2"
            >
              <h2
                id="workflow-tools-title"
                className="px-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                {t("workflow.sidebarTools")}
              </h2>
              <ToolChips refs={workflow.tools} />
            </section>
          )}

          {similar.length > 0 && (
            <section
              aria-labelledby="workflow-similar-title"
              className="space-y-2"
            >
              <h2
                id="workflow-similar-title"
                className="px-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                {t("workflow.similar")}
              </h2>
              <ul className="divide-y divide-border-soft overflow-hidden rounded-lg border border-border-soft bg-surface">
                {similar.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={workflowHref(w)}
                      className="flex items-start gap-3 px-3.5 py-3 transition-colors duration-200 hover:bg-surface-soft"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
                        <WorkflowIcon size={14} />
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="line-clamp-2 text-label font-semibold text-text">
                          {w.title}
                        </span>
                        <span className="mt-0.5 block truncate text-caption text-text-muted">
                          {t("workflow.stepCount", {
                            count: String(w.stepCount),
                          })}{" "}
                          · {w.creator.displayName}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
