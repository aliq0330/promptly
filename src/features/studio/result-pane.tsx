"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import { diffWords, type StudioSnapshot } from "@/lib/studio-diff";
import { composeRunText } from "@/lib/run-with-ai";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { RunButton } from "@/features/content/run-with-ai";
import { ScrollablePrompt } from "@/features/content/scrollable-prompt";
import { DiffText } from "./diff-text";
import { composeStudioResult, type StudioSources } from "./studio-model";

/**
 * The right-hand RESULT column: the text the draft assembles (variables →
 * preset → generator), computed locally. Studio runs no model; "Çalıştır" is
 * the app's normal open-in-AI flow. Kept visually separate from the editors.
 */
export function ResultPane({ draft, baseline, sources, changeCount }: { draft: StudioSnapshot; baseline: StudioSnapshot; sources: StudioSources; changeCount: number }) {
  const { t, language } = useTranslation();
  const [showDiff, setShowDiff] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const enableNegative = sources.generator?.generator.enableNegativePrompt ?? false;
  const result = useMemo(() => composeStudioResult(draft, language, enableNegative), [draft, language, enableNegative]);
  const original = useMemo(() => composeStudioResult(baseline, language, enableNegative), [baseline, language, enableNegative]);
  const segments = useMemo(() => (showDiff ? diffWords(original.text, result.text) : null), [showDiff, original.text, result.text]);
  const tools = sources.prompt?.prompt.tools ?? sources.generator?.generator.tools ?? sources.preset?.preset.tools ?? [];
  const media = sources.prompt?.prompt.media ?? [];
  const runText = composeRunText(result.text, result.negativeText);

  return (
    <section aria-labelledby="studio-result-title" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="studio-result-title" className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
          {t("studio.result")}
        </h2>
        {changeCount > 0 ? <Badge variant="accent">{t("studio.changeCount", { count: changeCount })}</Badge> : <Badge variant="neutral">{t("studio.noChanges")}</Badge>}
      </div>

      {result.text ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-text-secondary">{t("studio.resultHint")}</span>
            <span className="flex items-center gap-1">
              <CopyPromptButton text={result.text} size="md" />
              <RunButton text={runText} recommendedRefs={tools} preview size="md" />
            </span>
          </div>
          {segments ? (
            <ScrollablePrompt>
              <DiffText segments={segments} />
            </ScrollablePrompt>
          ) : (
            <ScrollablePrompt>{result.text}</ScrollablePrompt>
          )}
          {changeCount > 0 && original.text !== result.text && (
            <button
              type="button"
              onClick={() => setShowDiff((v) => !v)}
              className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-small font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {showDiff ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              {showDiff ? t("studio.hideDiff") : t("studio.showDiff")}
            </button>
          )}
          {result.negativeText && (
            <div className="space-y-1.5">
              <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.negativePrompt")}</p>
              <ScrollablePrompt>{result.negativeText}</ScrollablePrompt>
            </div>
          )}
          {result.json && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowJson((v) => !v)}
                aria-expanded={showJson}
                className="inline-flex h-10 items-center rounded-md px-2 text-small font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {showJson ? t("studio.hideJson") : t("studio.showJson")}
              </button>
              {showJson && <ScrollablePrompt as="pre">{JSON.stringify(result.json, null, 2)}</ScrollablePrompt>}
            </div>
          )}
        </>
      ) : (
        <p className="rounded-md bg-surface-soft p-4 text-small text-text-secondary">{t("studio.resultEmpty")}</p>
      )}

      {sources.workflow && draft.workflow && (
        <div className="space-y-1.5">
          <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.workflowFlow")}</p>
          <ol className="space-y-1 text-small text-text-secondary">
            {draft.workflow.steps.map((step, index) => (
              <li key={step.id} className="truncate">
                <span className="mr-1.5 font-semibold text-primary">{index + 1}</span>
                {step.title || step.content?.title || t("studio.untitledStep")}
              </li>
            ))}
          </ol>
        </div>
      )}

      {media.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.originalOutput")}</p>
          <div className="grid grid-cols-2 gap-2">
            {media.slice(0, 4).map((m, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- the original prompt's stored output image, shown for reference
              <img key={m.id} src={m.url} alt={m.alt || ""} loading="lazy" className={index === 0 && media.length % 2 === 1 ? "col-span-2 max-h-72 w-full rounded-md object-cover" : "max-h-48 w-full rounded-md object-cover"} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
