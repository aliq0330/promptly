"use client";

/**
 * "✨ Görselden alan öner" — prompt değişkenleri için görsel analizi
 * (CLAUDE.md §9.145, 1e). Mevcut `analyze-image` Edge Function'ının
 * `generator_builder` modunu olduğu gibi kullanır: değişkenler "alan" gibi
 * gönderilir; dönen eşleşen değerler değişkenlerin varsayılanı, önerilen yeni
 * alanlar yeni değişkenler olur. Hiçbir şey kendiliğinden uygulanmaz — kullanıcı
 * satırları işaretleyip "Seçilenleri Uygula"ya basmalı. Uygulama (varsayılan
 * güncelleme, yeni değişken + jeton ekleme) üst bileşendedir.
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeImageForGenerator } from "@/lib/supabase/image-analysis";
import {
  cleanVisionSuggestions,
  resolveVariableVisionValues,
  variablesToVisionContext,
  type MatchedVariableValue,
  type VisionVariable,
} from "@/lib/prompt-variable-vision";
import type { CleanSuggestedField } from "@/lib/generator-vision-mapping";
import { useTranslation } from "@/lib/i18n/language-provider";

type Status = "idle" | "loading" | "error";

export function VariableVisionAssist({
  promptText,
  variables,
  onApply,
}: {
  /** Analize bağlam olarak giden prompt metni (ilk 400 karakter). */
  promptText: string;
  variables: VisionVariable[];
  /** Varsayılan güncellemeleri ve yeni değişkenleri TEK çağrıda alır (iki ayrı üst-state güncellemesi birbirini ezmesin). */
  onApply: (result: { values: MatchedVariableValue[]; suggestions: CleanSuggestedField[] }) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [matched, setMatched] = useState<MatchedVariableValue[]>([]);
  const [suggestions, setSuggestions] = useState<CleanSuggestedField[]>([]);
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());
  const [checkedLabels, setCheckedLabels] = useState<Set<string>>(new Set());
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  function resetResult() {
    setMatched([]);
    setSuggestions([]);
    setCheckedNames(new Set());
    setCheckedLabels(new Set());
    setAppliedMessage(null);
  }

  function setSelectedFile(next: File | null) {
    setFile(next);
    setErrorMessage(null);
    setStatus("idle");
    resetResult();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) setSelectedFile(dropped);
  }

  async function handleAnalyze() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setStatus("loading");
    setErrorMessage(null);
    resetResult();

    const outcome = await analyzeImageForGenerator(file, {
      generator: { name: "Prompt", description: promptText.slice(0, 400), category: "" },
      fields: variablesToVisionContext(variables),
    });
    busyRef.current = false;

    if (!outcome.ok) {
      setStatus("error");
      setErrorMessage(outcome.error.message);
      return;
    }

    setStatus("idle");
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

  function handleApply() {
    const values = matched.filter((row) => checkedNames.has(row.name));
    const toAdd = suggestions.filter((item) => checkedLabels.has(item.label));
    if (values.length > 0 || toAdd.length > 0) onApply({ values, suggestions: toAdd });

    const parts: string[] = [];
    if (values.length > 0) parts.push(t("vision.variableDefaultsUpdated", { count: values.length }));
    if (toAdd.length > 0) parts.push(t("vision.variablesAdded", { count: toAdd.length }));
    setAppliedMessage(parts.length > 0 ? `${parts.join(", ")}.` : t("vision.nothingSelected"));

    // Uygulananlar listeden çıkar; panel açık kalır, yeni görsel denenebilir.
    setMatched((prev) => prev.filter((row) => !checkedNames.has(row.name)));
    setSuggestions((prev) => prev.filter((item) => !checkedLabels.has(item.label)));
  }

  const hasResult = matched.length > 0 || suggestions.length > 0;

  return (
    <div className="rounded-md border border-dashed border-border bg-accent-surface/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="variable-vision-assist-body"
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-text"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">{t("vision.variableTitle")}</span>
        <span className="text-xs font-normal text-text-muted">{expanded ? t("vision.hide") : t("vision.show")}</span>
      </button>

      {expanded && (
        <div id="variable-vision-assist-body" className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3">
          <p className="text-xs text-text-muted">{t("vision.variableIntro")}</p>

          {previewUrl ? (
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1 text-xs text-text-muted">
                <p className="truncate font-medium text-text">{file?.name}</p>
                <p>{file ? `${(file.size / 1024).toFixed(0)} KB` : null}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                aria-label={t("vision.removeImage")}
                className="rounded-full p-1 text-text-muted hover:bg-accent-surface hover:text-text"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-5 text-center transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-border bg-surface",
              )}
            >
              <ImagePlus className="h-6 w-6 text-text-muted" aria-hidden="true" />
              <p className="text-xs text-text-muted">{t("vision.dropHint")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                {t("vision.chooseImage")}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleInputChange}
                aria-label={t("vision.pickImageAriaLabel")}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={handleAnalyze} disabled={!file || status === "loading"}>
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {status === "loading" ? t("vision.analyzing") : t("vision.analyze")}
            </Button>
            {status === "loading" && (
              <span role="status" className="text-xs text-text-muted">
                {t("vision.mayTakeSeconds")}
              </span>
            )}
          </div>

          {status === "error" && errorMessage && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              {errorMessage}
            </p>
          )}

          {hasResult && (
            <div className="space-y-3 rounded-md border border-border bg-surface p-3">
              {matched.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("vision.variableMatched")}</p>
                  {matched.map((row) => (
                    <label key={row.name} className="flex cursor-pointer items-start gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={checkedNames.has(row.name)}
                        onChange={() => toggle(setCheckedNames, row.name)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                      />
                      <span className="min-w-0 break-words">
                        <span className="font-medium">{row.name.replace(/_/g, " ")}:</span> {row.display}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("vision.variableSuggested")}</p>
                  {suggestions.map((item) => (
                    <label key={item.label} className="flex cursor-pointer items-start gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={checkedLabels.has(item.label)}
                        onChange={() => toggle(setCheckedLabels, item.label)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                      />
                      <span className="min-w-0 break-words">
                        <span className="font-medium">+ {item.label}</span>
                        {item.options.length > 0 && (
                          <span className="text-text-muted"> ({item.options.map((o) => o.label).join(", ")})</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleApply}
                disabled={checkedNames.size === 0 && checkedLabels.size === 0}
              >
                {t("vision.applySelected")}
              </Button>
            </div>
          )}

          {appliedMessage && (
            <div className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-text">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <p className="flex-1">{appliedMessage}</p>
              <button
                type="button"
                onClick={() => setAppliedMessage(null)}
                aria-label={t("vision.closeThisInfo")}
                className="shrink-0 text-text-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
