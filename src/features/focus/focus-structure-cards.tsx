"use client";

import type { ReactNode } from "react";
import { ArrowDown, Blocks, SlidersHorizontal, Sparkles, Workflow as WorkflowIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentCard } from "@/features/content/content-card";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { MEDIA_ICON, STEP_TYPE_META } from "@/features/workflows/step-meta";
import type { FeedItem } from "@/features/feed/types";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetParameterEntries } from "@/lib/preset-utils";
import { generatorHref, presetHref, requestHref, workflowHref } from "@/lib/utils";
import type { Generator, Preset, PromptRequest, UserProfile, Workflow } from "@/types";
import { FocusVisualCard } from "./focus-visual-card";
import { FocusActions, FocusCreator, FocusTitle } from "./focus-parts";
import { useGeneratorFocusFields, useInViewOnce, useWorkflowFocusSteps } from "./use-focus-data";

/**
 * The cards for content whose value is its STRUCTURE rather than a picture:
 * a generator's parameters, a workflow's step chain, a preset's settings, a
 * request's brief. All four share one shell — creator, type icon + tag, title,
 * then the structure itself — so a mixed feed still reads as one system.
 */
function StructureShell({
  item,
  href,
  creator,
  icon: Icon,
  badge,
  detail,
  title,
  headerRight,
  children,
  observeRef,
}: {
  item: FeedItem;
  href: string;
  creator: UserProfile;
  icon: LucideIcon;
  badge: string;
  /** Secondary tag text (topic / content type) — hidden on the narrowest cards. */
  detail?: string | null;
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
  observeRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <ContentCard href={href} className="overflow-hidden">
      <div ref={observeRef} className="flex flex-1 flex-col gap-3 p-3 sm:p-3.5">
        <div className="flex items-center justify-between gap-2">
          <FocusCreator user={creator} />
          {headerRight}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {/* Icon tile on roomier cards; on a two-column phone layout the icon sits inline so the label has the room. */}
            <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary sm:flex">
              <Icon size={15} strokeWidth={1.9} aria-hidden />
            </span>
            <span className="flex min-w-0 items-center gap-1 text-caption font-semibold uppercase tracking-[0.04em] text-text-muted sm:tracking-[0.08em]">
              <Icon size={12} strokeWidth={2.25} aria-hidden className="shrink-0 text-primary sm:hidden" />
              <span className="truncate">{badge}</span>
              {detail && (
                <>
                  <span aria-hidden className="hidden sm:inline">·</span>
                  <span className="hidden truncate sm:inline">{detail}</span>
                </>
              )}
            </span>
          </div>
          <FocusTitle href={href} title={title} className="font-display text-body sm:text-h3" />
        </div>

        {children}
      </div>
      <FocusActions item={item} />
    </ContentCard>
  );
}

const MAX_LISTED = 4;

function Row({ children, as: Tag = "li" }: { children: ReactNode; as?: "li" | "div" }) {
  return <Tag className="flex min-w-0 items-center gap-2 rounded-sm bg-surface-soft px-2 py-1.5 text-caption text-text-secondary">{children}</Tag>;
}

/* ---------------------------------------------------------------- Generator */

export function FocusGeneratorCard({ generator }: { generator: Generator }) {
  const { t, language } = useTranslation();
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const { data, loading } = useGeneratorFocusFields(generator.currentVersionId, seen);
  const topic = taxonomyPathLabel(generator, language);
  const labels = data?.labels ?? [];

  return (
    <StructureShell
      item={{ kind: "generator", data: generator }}
      href={generatorHref(generator)}
      creator={generator.creator}
      icon={Blocks}
      badge={t("generator.singular")}
      detail={topic}
      title={generator.title}
      observeRef={ref}
    >
      {loading ? (
        <div className="space-y-1" aria-hidden>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-6 w-3/5" />
        </div>
      ) : labels.length > 0 ? (
        <>
          <ul className="space-y-1" aria-label={t("generator.parameterCount", { count: String(data?.count ?? labels.length) })}>
            {labels.slice(0, MAX_LISTED).map((label, index) => (
              <Row key={`${label}-${index}`}>
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <span className="truncate">{label}</span>
              </Row>
            ))}
          </ul>
          <p className="text-caption font-medium text-text-muted">{t("generator.parameterCount", { count: String(data?.count ?? labels.length) })}</p>
        </>
      ) : (
        generator.description && <p className="line-clamp-3 text-caption text-text-muted">{generator.description}</p>
      )}
    </StructureShell>
  );
}

/* ----------------------------------------------------------------- Workflow */

export function FocusWorkflowCard({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation();
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const cover = workflow.media[0] ?? null;
  // A workflow with a cover is shown as a picture; one without shows its real chain of steps.
  const { data: steps, loading } = useWorkflowFocusSteps(workflow.id, seen && !cover);
  const href = workflowHref(workflow);

  if (cover) {
    return (
      <FocusVisualCard
        item={{ kind: "workflow", data: workflow }}
        href={href}
        image={cover}
        creator={workflow.creator}
        title={workflow.title}
        badgeIcon={WorkflowIcon}
        badgeLabel={t("workflow.singular")}
        badgeDetail={t("workflow.stepCount", { count: String(workflow.stepCount) })}
        moreImages={Math.max(0, workflow.media.length - 1)}
      />
    );
  }

  const listed = (steps ?? []).slice(0, MAX_LISTED);
  const rest = (steps?.length ?? 0) - listed.length;

  return (
    <StructureShell
      item={{ kind: "workflow", data: workflow }}
      href={href}
      creator={workflow.creator}
      icon={WorkflowIcon}
      badge={t("workflow.singular")}
      title={workflow.title}
      observeRef={ref}
    >
      {loading ? (
        <div className="space-y-1" aria-hidden>
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-5/6" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ) : listed.length > 0 ? (
        <ol className="space-y-0.5">
          {listed.map((step, index) => {
            const StepIcon = step.content?.contentType ? MEDIA_ICON[step.content.contentType] : STEP_TYPE_META[step.stepType].icon;
            const label = step.title || step.content?.title || t(STEP_TYPE_META[step.stepType].labelKey);
            return (
              <li key={step.id}>
                <Row as="div">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[0.625rem] font-semibold leading-none text-primary-foreground">
                    {index + 1}
                  </span>
                  <StepIcon size={12} aria-hidden className="shrink-0 text-text-muted" />
                  <span className="truncate">{label}</span>
                </Row>
                {index < listed.length - 1 && (
                  <span aria-hidden className="flex h-3.5 items-center pl-3 text-text-muted">
                    <ArrowDown size={11} />
                  </span>
                )}
              </li>
            );
          })}
          {rest > 0 && <li className="pl-1 pt-1 text-caption font-medium text-text-muted">+{rest}</li>}
        </ol>
      ) : (
        // Still loading off-screen, or the steps couldn't be read: fall back to what the list already has.
        <div className="space-y-1.5">
          <p className="text-label font-medium text-text">{t("workflow.stepCount", { count: String(workflow.stepCount) })}</p>
          <span className="flex flex-wrap gap-1">
            {workflow.contentTypes.map((type) => {
              const TypeIcon = CONTENT_TYPE_META[type].icon;
              return (
                <span key={type} className="inline-flex h-5 items-center gap-1 rounded-full bg-surface-soft px-2 text-caption font-medium text-text-secondary">
                  <TypeIcon size={10} aria-hidden />
                  {t(CONTENT_TYPE_META[type].labelKey)}
                </span>
              );
            })}
          </span>
        </div>
      )}
      {steps && steps.length > 0 && <p className="text-caption font-medium text-text-muted">{t("workflow.stepCount", { count: String(steps.length) })}</p>}
    </StructureShell>
  );
}

/* ------------------------------------------------------------------- Preset */

export function FocusPresetCard({ preset }: { preset: Preset }) {
  const { t, language } = useTranslation();
  const entries = presetParameterEntries(preset, language);
  const shown = entries.slice(0, 3);

  return (
    <StructureShell
      item={{ kind: "preset", data: preset }}
      href={presetHref(preset)}
      creator={preset.creator}
      icon={SlidersHorizontal}
      badge={t("preset.singular")}
      title={preset.title}
    >
      {shown.length > 0 ? (
        <>
          <dl className="space-y-1">
            {shown.map((entry) => (
              <div key={entry.fieldId} className="flex min-w-0 items-baseline justify-between gap-2 rounded-sm bg-surface-soft px-2 py-1.5 text-caption">
                <dt className="shrink-0 text-text-muted">{entry.fieldLabel}</dt>
                <dd className="min-w-0 truncate text-right font-medium text-text">{entry.valueLabel}</dd>
              </div>
            ))}
          </dl>
          <p className="text-caption font-medium text-text-muted">
            {entries.length > shown.length ? `+${entries.length - shown.length} · ` : ""}
            {t("preset.paramCount", { count: entries.length })}
          </p>
        </>
      ) : (
        preset.description && <p className="line-clamp-3 text-caption text-text-muted">{preset.description}</p>
      )}
    </StructureShell>
  );
}

/* ------------------------------------------------------------------ Request */

export function FocusRequestCard({ request }: { request: PromptRequest }) {
  const { t, language } = useTranslation();
  const typeLabel = request.contentType ? t(CONTENT_TYPE_META[request.contentType].labelKey) : null;
  const topic = request.contentType ? taxonomyPathLabel({ ...request, contentType: request.contentType }, language, false) : "";

  return (
    <StructureShell
      item={{ kind: "request", data: request }}
      href={requestHref(request)}
      creator={request.author}
      icon={Sparkles}
      badge={t("request.title")}
      detail={typeLabel}
      title={request.title}
      headerRight={
        <Badge variant={STATUS_VARIANTS[request.status]} className="shrink-0">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          {t(STATUS_LABELS[request.status])}
        </Badge>
      }
    >
      <div className="space-y-2">
        {request.description && <p className="line-clamp-4 break-words text-caption text-text-secondary sm:text-small">{request.description}</p>}
        {(request.creativeDirection || topic) && (
          <p className="line-clamp-2 border-l-2 border-primary/40 pl-2 text-caption text-text-muted">
            {request.creativeDirection || topic}
          </p>
        )}
      </div>
    </StructureShell>
  );
}
