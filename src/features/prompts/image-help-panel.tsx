"use client";

/**
 * "✨ Görselden yardım" — the ONE image-assist box of the prompt form
 * (replaces the former "Görselden İlham Al" + "Görselden alan öner" pair, which
 * each asked for their own upload). It runs on the image the author already
 * picked in the Görseller card (`sourceFile`); only when there is none (other
 * content types, or editing a post whose images are already stored) does it
 * offer its own small file picker.
 *
 * Two independent, on-demand actions share the one image — each is a separate
 * `analyze-image` Edge Function mode and costs one call only when pressed:
 *  - "Prompt öner"   → `prompt_builder`: a prompt (+ things to avoid) the
 *                      author can write into / append to the prompt text.
 *  - "Değişken öner" → `generator_builder`: values for existing variables and
 *                      new variable suggestions (CLAUDE.md §9.145).
 * Nothing is ever applied on its own: the author clicks the apply buttons.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, CheckCircle2, ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { cn, copyTextToClipboard } from "@/lib/utils";
import { analyzeImageForGenerator, analyzeImageForPrompt } from "@/lib/supabase/image-analysis";
import {
  cleanVisionSuggestions,
  resolveVariableVisionValues,
  variablesToVisionContext,
  type MatchedVariableValue,
  type VisionVariable,
} from "@/lib/prompt-variable-vision";
import type { CleanSuggestedField } from "@/lib/generator-vision-mapping";
import type { PromptBuilderResult } from "@/lib/image-analysis-types";
import { useTranslation } from "@/lib/i18n/language-provider";

type Status = "idle" | "loading" | "error";

export function ImageHelpPanel({
  promptText,
  variables,
  sourceFile,
  onApplyPrompt,
  onApplyVariables,
}: {
  /** Context sent with the variable analysis (first 400 characters). */
  promptText: string;
  variables: VisionVariable[];
  /** The image already chosen in the form's image picker, if any. */
  sourceFile?: File | null;
  onApplyPrompt: (prompt: string, mode: "replace" | "append") => void;
  /** Default-value updates + new variables arrive in ONE call (two parent updates would overwrite each other). */
  onApplyVariables: (result: { values: MatchedVariableValue[]; suggestions: CleanSuggestedField[] }) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [ownFile, setOwnFile] = useState<File | null>(null);
  const file = sourceFile ?? ownFile;
  const inputRef = useRef<HTMLInputElement>(null);

  const [promptStatus, setPromptStatus] = useState<Status>("idle");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptResult, setPromptResult] = useState<PromptBuilderResult | null>(null);
  const [copiedNegative, setCopiedNegative] = useState(false);

  const [varStatus, setVarStatus] = useState<Status>("idle");
  const [varError, setVarError] = useState<string | null>(null);
  const [matched, setMatched] = useState<MatchedVariableValue[]>([]);
  const [suggestions, setSuggestions] = useState<CleanSuggestedField[]>([]);
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());
  const [checkedLabels, setCheckedLabels] = useState<Set<string>>(new Set());
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const busyRef = useRef(false);

  // A different image invalidates every earlier result.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset derived results when the analysed image changes
    setPromptResult(null);
    setPromptStatus("idle");
    setPromptError(null);
    setMatched([]);
    setSuggestions([]);
    setCheckedNames(new Set());
    setCheckedLabels(new Set());
    setAppliedMessage(null);
    setVarStatus("idle");
    setVarError(null);
  }, [file]);

  const previewUrl = useObjectUrl(file);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setOwnFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  async function runPrompt() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setPromptStatus("loading");
    setPromptError(null);
    setPromptResult(null);
    const outcome = await analyzeImageForPrompt(file);
    busyRef.current = false;
    if (!outcome.ok) {
      setPromptStatus("error");
      setPromptError(outcome.error.message);
      return;
    }
    setPromptStatus("idle");
    setPromptResult(outcome.data);
  }

  async function runVariables() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setVarStatus("loading");
    setVarError(null);
    setMatched([]);
    setSuggestions([]);
    setAppliedMessage(null);
    const outcome = await analyzeImageForGenerator(file, {
      generator: { name: "Prompt", description: promptText.slice(0, 400), category: "" },
      fields: variablesToVisionContext(variables),
    });
    busyRef.current = false;
    if (!outcome.ok) {
      setVarStatus("error");
      setVarError(outcome.error.message);
      return;
    }
    setVarStatus("idle");
    const rows = resolveVariableVisionValues(variables, outcome.data);
    const clean = cleanVisionSuggestions(outcome.data, variables);
    setMatched(rows);
    setSuggestions(clean);
    setCheckedNames(new Set(rows.map((row) => row.name)));
    setCheckedLabels(new Set(clean.map((item) => item.label)));
    if (rows.length === 0 && clean.length === 0) setAppliedMessage(t("vision.variableNoResult"));
  }

  function toggle<T>(setter: (fn: (prev: Set<T>) => Set<T>) => void, key: T) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyVariables() {
    const values = matched.filter((row) => checkedNames.has(row.name));
    const toAdd = suggestions.filter((item) => checkedLabels.has(item.label));
    if (values.length > 0 || toAdd.length > 0) onApplyVariables({ values, suggestions: toAdd });
    const parts: string[] = [];
    if (values.length > 0) parts.push(t("vision.variableDefaultsUpdated", { count: values.length }));
    if (toAdd.length > 0) parts.push(t("vision.variablesAdded", { count: toAdd.length }));
    setAppliedMessage(parts.length > 0 ? `${parts.join(", ")}.` : t("vision.nothingSelected"));
    setMatched((prev) => prev.filter((row) => !checkedNames.has(row.name)));
    setSuggestions((prev) => prev.filter((item) => !checkedLabels.has(item.label)));
  }

  const analysisEntries = promptResult
    ? Object.entries(promptResult.analysis ?? {}).filter(([, v]) => typeof v === "string" && v.trim())
    : [];
  const busy = promptStatus === "loading" || varStatus === "loading";
  const hasVarResult = matched.length > 0 || suggestions.length > 0;

  return (
    <div className="rounded-lg border border-border bg-surface-soft/60" data-image-help>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="image-help-body"
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-small font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">{t("vision.helpTitle")}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-text-muted transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
      </button>

      <Collapsible open={expanded} id="image-help-body">
        <div className="space-y-3 border-t border-border-soft px-3 pb-3 pt-3">
          <p className="text-caption text-text-secondary">{t("vision.helpIntro")}</p>

          {file ? (
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2.5">
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing for next/image to optimise
                <img src={previewUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1 text-caption text-text-muted">
                <p className="truncate font-medium text-text">{file.name}</p>
                <p>{sourceFile ? t("vision.usingUploaded") : `${(file.size / 1024).toFixed(0)} KB`}</p>
              </div>
              {!sourceFile && (
                <button
                  type="button"
                  onClick={() => setOwnFile(null)}
                  aria-label={t("vision.removeImage")}
                  className="rounded-full p-1 text-text-muted hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-surface p-3">
              <p className="min-w-0 flex-1 text-caption text-text-muted">{t("vision.helpNeedsImage")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Camera className="h-4 w-4" aria-hidden />
                {t("vision.chooseImage")}
              </Button>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleInputChange} aria-label={t("vision.pickImageAriaLabel")} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={runPrompt} disabled={!file || busy}>
              {promptStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {promptStatus === "loading" ? t("vision.analyzing") : t("vision.suggestPrompt")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={runVariables} disabled={!file || busy}>
              {varStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {varStatus === "loading" ? t("vision.analyzing") : t("vision.suggestVariables")}
            </Button>
            {busy && (
              <span role="status" className="text-caption text-text-muted">
                {t("vision.mayTakeSeconds")}
              </span>
            )}
          </div>

          {promptStatus === "error" && promptError && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-caption text-danger">
              {promptError}
            </p>
          )}
          {varStatus === "error" && varError && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-caption text-danger">
              {varError}
            </p>
          )}

          {promptResult && (
            <div className="space-y-3 rounded-md border border-border bg-surface p-3">
              {analysisEntries.length > 0 && (
                <div className="space-y-1">
                  <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t("vision.imageAnalysis")}</p>
                  <dl className="space-y-0.5 text-small text-text">
                    {analysisEntries.map(([key, value]) => (
                      <div key={key} className="flex gap-1.5">
                        <dt className="shrink-0 font-medium">{key}:</dt>
                        <dd className="text-text-muted">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {promptResult.prompt && (
                <div className="space-y-1.5">
                  <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t("vision.generatedPrompt")}</p>
                  <p className="whitespace-pre-wrap rounded-md bg-surface-soft p-2.5 text-small text-text">{promptResult.prompt}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => onApplyPrompt(promptResult.prompt, "replace")}>
                      {t("vision.writeToPromptField")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => onApplyPrompt(promptResult.prompt, "append")}>
                      {t("vision.appendToPrompt")}
                    </Button>
                  </div>
                </div>
              )}
              {promptResult.negativePrompt && (
                <div className="space-y-1">
                  <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t("vision.avoidThese")}</p>
                  <p className="whitespace-pre-wrap rounded-md bg-surface-soft p-2.5 font-mono text-caption text-text-muted">{promptResult.negativePrompt}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await copyTextToClipboard(promptResult.negativePrompt)) {
                        setCopiedNegative(true);
                        setTimeout(() => setCopiedNegative(false), 1500);
                      }
                    }}
                    className="text-caption font-medium text-primary hover:underline"
                  >
                    {copiedNegative ? t("common.copied") : t("common.copy")}
                  </button>
                </div>
              )}
            </div>
          )}

          {hasVarResult && (
            <div className="space-y-3 rounded-md border border-border bg-surface p-3">
              {matched.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t("vision.variableMatched")}</p>
                  {matched.map((row) => (
                    <label key={row.name} className="flex cursor-pointer items-start gap-2 text-small text-text">
                      <input type="checkbox" checked={checkedNames.has(row.name)} onChange={() => toggle(setCheckedNames, row.name)} className="mt-0.5 h-4 w-4 rounded border-border text-primary" />
                      <span className="min-w-0 break-words">
                        <span className="font-medium">{row.name.replace(/_/g, " ")}:</span> {row.display}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t("vision.variableSuggested")}</p>
                  {suggestions.map((item) => (
                    <label key={item.label} className="flex cursor-pointer items-start gap-2 text-small text-text">
                      <input type="checkbox" checked={checkedLabels.has(item.label)} onChange={() => toggle(setCheckedLabels, item.label)} className="mt-0.5 h-4 w-4 rounded border-border text-primary" />
                      <span className="min-w-0 break-words">
                        <span className="font-medium">+ {item.label}</span>
                        {item.options.length > 0 && <span className="text-text-muted"> ({item.options.map((o) => o.label).join(", ")})</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <Button type="button" size="sm" variant="outline" onClick={applyVariables} disabled={checkedNames.size === 0 && checkedLabels.size === 0}>
                {t("vision.applySelected")}
              </Button>
            </div>
          )}

          {appliedMessage && (
            <div className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-caption text-text">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <p className="flex-1">{appliedMessage}</p>
              <button type="button" onClick={() => setAppliedMessage(null)} aria-label={t("vision.closeThisInfo")} className="shrink-0 text-text-muted hover:text-text">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

/** A preview URL for a File, revoked when the file changes or the panel unmounts. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the file prop
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}
