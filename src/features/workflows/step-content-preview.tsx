"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchPromptById } from "@/lib/supabase/prompts";
import { fetchGeneratorById, fetchGeneratorVersion } from "@/lib/supabase/generators";
import type { WorkflowContentRef, WorkflowStep } from "@/types";
import { MEDIA_ICON, STEP_TYPE_META, stepSubtitle } from "./step-meta";

/** What a step's hover/tap preview shows beyond the light `WorkflowContentRef`. */
type PreviewData =
  | { kind: "prompt"; description: string; promptText: string; imageUrl: string | null }
  | { kind: "generator"; description: string; imageUrl: string | null; fields: string[] }
  | { kind: "basic" };

// One fetch per piece of content for the whole session (hovering back and forth is free).
const cache = new Map<string, Promise<PreviewData | null>>();

function loadPreview(ref: WorkflowContentRef): Promise<PreviewData | null> {
  const key = `${ref.type}:${ref.id}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = (async (): Promise<PreviewData | null> => {
      if (ref.type === "prompt") {
        const prompt = await fetchPromptById(ref.id);
        if (!prompt) return null;
        return { kind: "prompt", description: prompt.description, promptText: prompt.promptText, imageUrl: prompt.media[0]?.url ?? null };
      }
      if (ref.type === "generator") {
        const generator = await fetchGeneratorById(ref.id);
        if (!generator) return null;
        const version = generator.currentVersionId ? await fetchGeneratorVersion(generator.currentVersionId) : null;
        return {
          kind: "generator",
          description: generator.description,
          imageUrl: generator.coverUrl,
          fields: (version?.schema.fields ?? []).map((field) => field.label).filter(Boolean),
        };
      }
      return { kind: "basic" };
    })().catch(() => null);
    cache.set(key, hit);
    // A failed lookup shouldn't stick for the session.
    hit.then((value) => value === null && cache.delete(key));
  }
  return hit;
}

function usePreviewData(ref: WorkflowContentRef | null) {
  const [state, setState] = useState<{ key: string; data: PreviewData | null } | null>(null);
  const key = ref ? `${ref.type}:${ref.id}` : null;
  useEffect(() => {
    if (!ref || !key) return;
    let cancelled = false;
    loadPreview(ref).then((data) => !cancelled && setState({ key, data }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by type:id
  }, [key]);
  if (!key) return { loading: false, data: null as PreviewData | null };
  if (state?.key !== key) return { loading: true, data: null as PreviewData | null };
  return { loading: false, data: state.data };
}

const MAX_FIELDS = 6;

/** The step's linked prompt / generator at a glance: title, blurb, type, a small image and a short body. */
export function StepPreviewBody({ step }: { step: WorkflowStep }) {
  const { t, language } = useTranslation();
  const ref = step.content;
  const { loading, data } = usePreviewData(ref);
  if (!ref) return null;

  const meta = STEP_TYPE_META[step.stepType];
  const Icon = meta.icon;
  const MediaIcon = ref.contentType ? MEDIA_ICON[ref.contentType] : null;
  const image = ref.thumbnailUrl ?? (data && data.kind !== "basic" ? data.imageUrl : null);
  const description = data && data.kind !== "basic" ? data.description : "";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- real (possibly data-URL) thumbnail
          <img src={image} alt="" className="h-16 w-16 shrink-0 rounded-md border border-border-soft object-cover" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Icon size={24} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-caption font-medium text-text-muted">
            <Icon size={12} className="shrink-0" />
            <span className="shrink-0">{t(meta.labelKey)}</span>
            {MediaIcon && <MediaIcon size={12} className="shrink-0" />}
            <span className="truncate">{stepSubtitle(step, language)}</span>
          </p>
          <p className="break-words text-sm font-semibold text-text">{ref.title}</p>
          <p className="truncate text-caption text-text-muted">@{ref.authorUsername}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : data === null ? (
        <p className="text-caption text-text-muted">{t("workflow.flowPreviewUnavailable")}</p>
      ) : (
        <>
          {description && <p className="line-clamp-3 break-words text-small text-text-secondary">{description}</p>}
          {data.kind === "prompt" && data.promptText && (
            <p className="prompt-text line-clamp-4 break-words rounded-md border border-border-soft bg-surface-soft p-2.5 text-caption text-text">{data.promptText}</p>
          )}
          {data.kind === "generator" && data.fields.length > 0 && (
            <div>
              <p className="mb-1 text-caption font-semibold uppercase tracking-[0.06em] text-text-muted">
                {t("workflow.flowParams")} · {data.fields.length}
              </p>
              <ul className="flex flex-wrap gap-1">
                {data.fields.slice(0, MAX_FIELDS).map((label, i) => (
                  <li key={`${label}-${i}`} className="max-w-full truncate rounded-full bg-surface-soft px-2 py-0.5 text-caption text-text-secondary">
                    {label}
                  </li>
                ))}
                {data.fields.length > MAX_FIELDS && (
                  <li className="rounded-full bg-surface-soft px-2 py-0.5 text-caption text-text-muted">+{data.fields.length - MAX_FIELDS}</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      {ref.published && (
        <Link href={ref.href} className="inline-flex items-center gap-1.5 text-label font-medium text-primary hover:underline">
          <ExternalLink size={14} />
          {t("workflow.flowOpen")}
        </Link>
      )}
    </div>
  );
}
