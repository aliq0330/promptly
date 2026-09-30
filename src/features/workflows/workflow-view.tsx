"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowRight, ExternalLink, Pencil, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ToolLine } from "@/features/content/tool-chips";
import { ShareButton } from "@/features/prompts/share-button";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useAuth } from "@/features/auth/auth-provider";
import { deleteWorkflow, fetchWorkflowById } from "@/lib/supabase/workflows";
import { incomingLinks } from "@/lib/workflow-logic";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, profileHref } from "@/lib/utils";
import type { Workflow, WorkflowStep } from "@/types";
import { categoryLabel, MEDIA_ICON, STEP_TYPE_META, stepSubtitle } from "./step-meta";
import { workflowHref } from "./workflow-card";

/** Read-only workflow page: who made it, what it's for, and the ordered steps — each links to its prompt / generator / request. */
export function WorkflowDetailView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const id = useSearchParams().get("id");
  const [data, setData] = useState<{ workflow: Workflow; steps: WorkflowStep[] } | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchWorkflowById(id).then((result) => !cancelled && setData(result));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <NotFoundBlock title={t("workflow.notFoundTitle")} description={t("common.brokenLinkHint")} />;
  if (data === undefined) return <DetailSkeleton />;
  if (!data) return <NotFoundBlock title={t("workflow.notFoundTitle")} description={t("workflow.notFoundBody")} />;

  const { workflow, steps } = data;
  const isOwner = user?.id === workflow.creator.id;
  const category = categoryLabel(workflow.contentTypes, workflow.category, language);

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteWorkflow(workflow.id);
      router.push("/workflows");
    } catch {
      setDeleteError(true);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8">
      <header className="overflow-hidden rounded-lg border border-border-soft bg-surface shadow-card">
        {workflow.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- real local data-URL cover
          <img src={workflow.coverUrl} alt="" className="aspect-video w-full object-cover" />
        )}
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ContentTypeLabel icon={WorkflowIcon} label={t("workflow.singular")} detail={category} />
            {workflow.status === "draft" && <Badge variant="warning">{t("workflow.draftBadge")}</Badge>}
          </div>
          <h1 className="text-h1 font-semibold text-text">{workflow.title}</h1>
          {workflow.description && <p className="text-body text-text-secondary">{workflow.description}</p>}
          <Link href={profileHref(workflow.creator)} className="inline-flex max-w-full items-center gap-2.5 rounded-md">
            <Avatar src={workflow.creator.avatarUrl} alt={workflow.creator.displayName} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-text">{workflow.creator.displayName}</span>
              <span className="block truncate text-caption text-text-muted">@{workflow.creator.username}</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-1.5">
            {workflow.contentTypes.map((type) => {
              const Icon = CONTENT_TYPE_META[type].icon;
              return (
                <span key={type} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-secondary">
                  <Icon size={11} />
                  {t(CONTENT_TYPE_META[type].labelKey)}
                </span>
              );
            })}
            <span className="text-caption text-text-muted">{t("workflow.stepCount", { count: String(steps.length) })}</span>
          </div>
          <ToolLine label={t("tool.recommendedLabel")} refs={workflow.tools} />
          <div className="flex flex-wrap items-center gap-2 border-t border-border-soft pt-3">
            <ShareButton url={workflowHref(workflow)} title={workflow.title} />
            {isOwner && (
              <>
                <Link href={`/workflows/create?edit=${workflow.id}`} className={buttonClassName({ variant: "outline", size: "sm" })}>
                  <Pencil size={14} />
                  {t("workflow.edit")}
                </Link>
                <Button type="button" variant={confirmDelete ? "danger" : "outline"} size="sm" onClick={handleDelete} onBlur={() => setConfirmDelete(false)}>
                  <Trash2 size={14} />
                  {confirmDelete ? t("workflow.confirmDeleteWorkflow") : t("workflow.deleteWorkflow")}
                </Button>
              </>
            )}
          </div>
          {deleteError && <p className="text-sm text-danger">{t("workflow.deleteFailed")}</p>}
        </div>
      </header>

      <section aria-labelledby="workflow-steps-heading" className="space-y-1">
        <h2 id="workflow-steps-heading" className="mb-3 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
          {t("workflow.viewStepsHeading")}
        </h2>
        <ol>
          {steps.map((step, index) => {
            const meta = STEP_TYPE_META[step.stepType];
            const Icon = meta.icon;
            const c = step.content;
            const links = incomingLinks(steps, step.id);
            const openable = Boolean(c && c.published);
            const MediaIcon = c?.contentType ? MEDIA_ICON[c.contentType] : null;
            const body = (
              <>
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text">{step.title || t("workflow.untitledStep")}</p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 text-caption text-text-muted">
                      <Icon size={12} className="shrink-0" />
                      <span className="truncate">{[t(meta.labelKey), stepSubtitle(step, language)].filter(Boolean).join(" · ")}</span>
                    </p>
                    {step.description && <p className="mt-1.5 text-small text-text-secondary">{step.description}</p>}
                    {c ? (
                      <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-caption text-text">
                        {MediaIcon && <MediaIcon size={12} className="shrink-0 text-text-muted" />}
                        <span className="truncate font-medium">{c.title}</span>
                        <span className="shrink-0 text-text-muted">@{c.authorUsername}</span>
                      </p>
                    ) : (
                      <p className="mt-1.5 text-caption text-text-muted">{step.contentMissing ? t("workflow.contentMissing") : t("workflow.stepNoContentPublic")}</p>
                    )}
                    {c && !c.published && <p className="mt-1 text-caption text-warning">{t("workflow.unpublishedGenerator")}</p>}
                    {(step.inputs.length > 0 || step.outputs.length > 0) && (
                      <div className="mt-2.5 grid gap-2 text-caption sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="mb-0.5 font-semibold uppercase tracking-[0.06em] text-text-muted">{t("workflow.inputLabel")}</p>
                          {step.inputs.length === 0 ? (
                            <p className="text-text-muted">—</p>
                          ) : (
                            <ul className="space-y-0.5">
                              {step.inputs.map((input) => {
                                const link = links.find((l) => l.input.id === input.id);
                                return (
                                  <li key={input.id} className="text-text">
                                    • {input.label}
                                    {link && (
                                      <span className="ml-1 inline-flex items-center gap-0.5 text-primary">
                                        <ArrowRight size={10} className="rotate-180" aria-hidden />
                                        {t("workflow.linkedFrom", { n: String(link.fromIndex + 1), label: link.output.label })}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="mb-0.5 font-semibold uppercase tracking-[0.06em] text-text-muted">{t("workflow.outputLabel")}</p>
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
                  {openable && <ExternalLink size={14} className="mt-1 shrink-0 text-text-muted" aria-hidden />}
                </div>
              </>
            );
            return (
              <li key={step.id}>
                {openable ? (
                  <Link
                    href={c!.href}
                    className={cn("block rounded-lg border border-border-soft bg-surface p-3.5 shadow-card transition-[border-color,box-shadow] duration-200 ease-soft hover:border-border hover:shadow-card-hover")}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-lg border border-border-soft bg-surface p-3.5 shadow-card">{body}</div>
                )}
                {index < steps.length - 1 && (
                  <div className="flex justify-center py-1.5 text-border-strong" aria-hidden>
                    <ArrowDown size={16} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
