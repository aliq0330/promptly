"use client";

import { useState, type ReactNode } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { ArrowDown } from "@/components/icons/arrow-down";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Shapes } from "@/components/icons/shapes";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PromptPreviewBox } from "@/features/prompts/prompt-preview-box";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { MEDIA_ICON, STEP_TYPE_META } from "@/features/workflows/step-meta";
import type { PostFeedItem } from "@/features/feed/types";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetParameterEntries } from "@/lib/preset-utils";
import { splitSourceNotes } from "@/lib/source-notes";
import { SKILL_COMPAT_LABEL, skillLabelText } from "@/lib/skills/categories";
import { cn, presetHref, promptHref, requestHref, skillHref, workflowHref } from "@/lib/utils";
import type { Preset, PromptRequest, Skill, UserProfile, Workflow } from "@/types";
import { useAuth } from "@/features/auth/auth-provider";
import { AddToSpaceModal } from "@/features/spaces/add-to-space-modal";
import { useWorkflowFocusSteps } from "./use-focus-data";

/** Everything a slide shows about an entry, read from the real feed row (nothing assumed beyond its own fields). */
export interface SlideModel {
  href: string;
  author: UserProfile;
  createdAt: string;
  icon: IconComponent;
  typeLabel: string;
  title: string;
  /** Description without the "Kaynak: …" credit lines (those belong on the detail page, as on the cards). */
  description: string;
  /** Tool/model name, when the entry has one. */
  tool: string | null;
}

/** The detail page of a post (every kind has its own href builder). */
export function itemHref(item: PostFeedItem): string {
  switch (item.kind) {
    case "prompt":
      return promptHref(item.data);
    case "workflow":
      return workflowHref(item.data);
    case "preset":
      return presetHref(item.data);
    case "request":
      return requestHref(item.data);
    case "skill":
      return skillHref(item.data);
  }
}

export function modelOf(item: PostFeedItem, t: ReturnType<typeof useTranslation>["t"]): SlideModel {
  const base = (description: string, tools: string[], fallbackTool: string | null = null) => ({
    description: splitSourceNotes(description).body,
    tool: resolveToolRefs(tools)[0]?.label ?? fallbackTool,
  });
  switch (item.kind) {
    case "prompt": {
      const meta = CONTENT_TYPE_META[item.data.contentType];
      return {
        href: promptHref(item.data),
        author: item.data.author,
        createdAt: item.data.createdAt,
        icon: meta.icon,
        typeLabel: `${t(meta.labelKey)} Prompt`,
        title: item.data.title,
        ...base(item.data.description, item.data.tools, item.data.tool),
      };
    }
    case "workflow":
      return { href: workflowHref(item.data), author: item.data.creator, createdAt: item.data.createdAt, icon: WorkflowIcon, typeLabel: t("workflow.singular"), title: item.data.title, ...base(item.data.description, item.data.tools) };
    case "preset":
      return { href: presetHref(item.data), author: item.data.creator, createdAt: item.data.createdAt, icon: SlidersHorizontal, typeLabel: t("preset.singular"), title: item.data.title, ...base(item.data.description, item.data.tools) };
    case "request":
      return { href: requestHref(item.data), author: item.data.author, createdAt: item.data.createdAt, icon: Sparkles, typeLabel: t("request.title"), title: item.data.title, ...base(item.data.description, item.data.tools, item.data.preferredTool) };
    case "skill":
      return {
        href: skillHref(item.data),
        author: item.data.creator,
        createdAt: item.data.createdAt,
        icon: GraduationCap,
        typeLabel: t("skill.singular"),
        title: item.data.title,
        description: item.data.summary,
        tool: item.data.compat[0] ? skillLabelText(SKILL_COMPAT_LABEL[item.data.compat[0]], t) : null,
      };
  }
}

/* ------------------------------------------------------------ structure blocks */

const MAX_STEPS = 6;

export function WorkflowSteps({ workflow, near, onImage }: { workflow: Workflow; near: boolean; onImage: boolean }) {
  const { t } = useTranslation();
  const { data: steps, loading } = useWorkflowFocusSteps(workflow.id, near);
  const listed = (steps ?? []).slice(0, onImage ? 3 : MAX_STEPS);
  const rest = (steps?.length ?? 0) - listed.length;
  const row = onImage ? "bg-art-chip text-on-art backdrop-blur-sm" : "bg-surface-soft text-text-secondary";

  if (loading)
    return (
      <div className="space-y-1.5" aria-hidden>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-5/6" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  // Steps unreadable (or not fetched yet): only what the list row already knows.
  if (listed.length === 0)
    return <p className={cn("text-label font-semibold", onImage ? "text-on-art" : "text-text")}>{t("workflow.stepCount", { count: String(workflow.stepCount) })}</p>;

  return (
    <div className="space-y-1.5">
      <p className={cn("text-caption font-semibold", onImage ? "text-on-art-muted" : "text-text-muted")}>
        {t("focusFeed.steps")} · {t("workflow.stepCount", { count: String(steps?.length ?? workflow.stepCount) })}
      </p>
      <ol className="space-y-0.5">
        {listed.map((step, index) => {
          const StepIcon = step.content?.contentType ? MEDIA_ICON[step.content.contentType] : STEP_TYPE_META[step.stepType].icon;
          const label = step.title || step.content?.title || t(STEP_TYPE_META[step.stepType].labelKey);
          return (
            <li key={step.id}>
              <div className={cn("flex min-w-0 items-center gap-3 rounded-md px-3 py-2 text-small", row)}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-semibold leading-none text-primary-foreground">{index + 1}</span>
                <StepIcon size={16} aria-hidden className="shrink-0 opacity-70" />
                <span className="truncate">{label}</span>
              </div>
              {index < listed.length - 1 && (
                <span aria-hidden className={cn("flex h-3 items-center pl-4", onImage ? "text-on-art-faint" : "text-text-muted")}>
                  <ArrowDown size={12} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {rest > 0 && <p className={cn("pl-1 text-caption font-semibold", onImage ? "text-on-art-muted" : "text-text-muted")}>+{rest}</p>}
    </div>
  );
}

export function PresetParams({ preset, onImage }: { preset: Preset; onImage: boolean }) {
  const { t, language } = useTranslation();
  const entries = presetParameterEntries(preset, language);
  const shown = entries.slice(0, onImage ? 3 : MAX_STEPS);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <dl className={cn("grid gap-1.5", !onImage && "sm:grid-cols-2")}>
        {shown.map((entry) => (
          <div
            key={entry.fieldId}
            className={cn(
              "flex min-w-0 items-baseline justify-between gap-3 rounded-md px-3 py-2 text-small",
              onImage ? "bg-art-chip backdrop-blur-sm" : "bg-surface-soft",
            )}
          >
            <dt className={cn("shrink-0", onImage ? "text-on-art-muted" : "text-text-muted")}>{entry.fieldLabel}</dt>
            <dd className={cn("min-w-0 truncate text-right font-semibold", onImage ? "text-on-art" : "text-text")}>{entry.valueLabel}</dd>
          </div>
        ))}
      </dl>
      <p className={cn("text-caption font-semibold", onImage ? "text-on-art-muted" : "text-text-muted")}>
        {entries.length > shown.length ? `+${entries.length - shown.length} · ` : ""}
        {t("preset.paramCount", { count: entries.length })}
      </p>
    </div>
  );
}

export function RequestBrief({ request, onImage }: { request: PromptRequest; onImage: boolean }) {
  const { t } = useTranslation();
  if (!request.creativeDirection) return null;
  return (
    <div className={cn("border-l-2 pl-3", onImage ? "border-white/60" : "border-primary/50")}>
      <p className={cn("text-caption font-semibold", onImage ? "text-on-art-muted" : "text-text-muted")}>{t("request.creativeDirection")}</p>
      <p className={cn("mt-0.5 line-clamp-3 break-words text-small", onImage ? "text-on-art" : "text-text-secondary")}>{request.creativeDirection}</p>
    </div>
  );
}

/** A Skill's quiet facts under its summary: the tools it is written for + its version (the instructions themselves stay on the detail page). */
export function SkillBrief({ skill, onImage }: { skill: Skill; onImage: boolean }) {
  const { t } = useTranslation();
  if (skill.compat.length === 0) return null;
  return (
    <div className={cn("border-l-2 pl-3", onImage ? "border-white/60" : "border-primary/50")}>
      <p className={cn("text-caption font-semibold", onImage ? "text-on-art-muted" : "text-text-muted")}>{t("skill.compatLabel")}</p>
      <p className={cn("mt-0.5 line-clamp-2 break-words text-small", onImage ? "text-on-art" : "text-text-secondary")}>
        {skill.compat.map((tool) => skillLabelText(SKILL_COMPAT_LABEL[tool], t)).join(", ")} · v{skill.version}
      </p>
    </div>
  );
}

export function RequestStatus({ request }: { request: PromptRequest }) {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[request.status]} className="shrink-0">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(STATUS_LABELS[request.status])}
    </Badge>
  );
}

/** Per-kind structure under the title (visual slides show a compact version over the picture). */
export function StructureBlock({ item, near, onImage }: { item: PostFeedItem; near: boolean; onImage: boolean }): ReactNode {
  switch (item.kind) {
    case "workflow":
      return <WorkflowSteps workflow={item.data} near={near} onImage={onImage} />;
    case "preset":
      return <PresetParams preset={item.data} onImage={onImage} />;
    case "request":
      return <RequestBrief request={item.data} onImage={onImage} />;
    case "skill":
      return <SkillBrief skill={item.data} onImage={onImage} />;
    case "prompt":
      // A text-first prompt shows its own words in the signature mono block (with the shared Kopyala + use count).
      return !onImage && item.data.promptText.trim() ? <PromptPreviewBox prompt={item.data} lines={6} /> : null;
  }
}

/** Odak'ta "Space'e ekle" (docs/history/213-*): oturumlu kullanıcıya, topluluğa ait olmayan gönderide. */
export function FocusAddToSpace({ item, className }: { item: PostFeedItem; className: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user || ("communityId" in item.data && item.data.communityId)) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className} data-focus-add-to-space="">
        <Shapes size={16} aria-hidden />
        {t("spaces.add.menu")}
      </button>
      {open && <AddToSpaceModal target={{ type: item.kind, id: item.data.id }} onClose={() => setOpen(false)} />}
    </>
  );
}
