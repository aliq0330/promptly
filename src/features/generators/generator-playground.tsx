"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultValuesFromSchema } from "@/lib/generator-template";
import { buildGeneratorOutput } from "@/lib/generator-output";
import { mapVisionResultToFieldValues, readNegativePromptSeed, readPromptSeed, type VisionAnalysisData } from "@/lib/vision-analysis";
import { GeneratorRuntimeForm } from "./generator-runtime-form";
import { GeneratedPromptPanel } from "./generated-prompt-panel";
import { GeneratorJsonPanel } from "./generator-json-panel";
import { VisionAnalysisPanel } from "./vision-analysis-panel";
import type { GeneratorSchema, GeneratorValues } from "@/types";

/**
 * The one real "fill the form → get a real, structured output" surface
 * (§16/§20), shared, unmodified, by both the builder's own Live Preview
 * pane and the real public generator runtime page (CLAUDE.md §12/§13's
 * "generator creator ile generator user aynı runtime componentleri
 * paylaşmalı", now satisfied at this top level too, not just at the
 * individual-field level `generator-runtime-field.tsx` already covers).
 * Owns its own `values` state — new fields added while editing the schema
 * get their default merged in without discarding whatever the author has
 * already typed into existing fields (see the sync effect below);
 * "Varsayılanlara dön" (from `GeneratedPromptPanel`/`GeneratorJsonPanel`)
 * fully resets to the schema's real defaults.
 *
 * Three tabs: FORM (fill it in), JSON (the generator's real, structured
 * output — `buildGeneratorOutput()`, the primary artifact), and PROMPT (a
 * human-readable view of just that JSON's own `prompt`/`negative_prompt`
 * properties). Both the JSON and Prompt tabs are computed from the exact
 * same `buildGeneratorOutput()` call — there is only ever one source of
 * truth, the two tabs are just two different views onto it.
 *
 * ARCHITECTURE NOTE — who writes `prompt`/`negative_prompt`, and when:
 * the generator's CREATOR no longer authors a `{{variable}}` prompt
 * template at all (that whole step was removed from the builder — see
 * `generator-builder.tsx`'s own doc comment). Instead, whoever RUNS a
 * generator types the real prompt/negative-prompt text directly, in two
 * plain fields at the very top of the Form tab — above the schema's own
 * fields, which the runtime user fills in below. That text is
 * written into `buildGeneratorOutput()`'s output verbatim (trimmed, never
 * rendered/substituted) — see `generator-output.ts`.
 */
export function GeneratorPlayground({
  schema,
  enableNegativePrompt,
  renderActions,
}: {
  schema: GeneratorSchema;
  enableNegativePrompt: boolean;
  /** Only the real runtime page passes this — the "Prompt olarak aç"/"Kaydet" buttons, given the exact live-computed state to act on. The builder's own preview passes nothing. */
  renderActions?: (state: { values: GeneratorValues; prompt: string; negativePrompt: string | null }) => React.ReactNode;
}) {
  const [tab, setTab] = useState<"form" | "json" | "prompt">("form");
  const [values, setValues] = useState<GeneratorValues>(() => defaultValuesFromSchema(schema));
  const [promptText, setPromptText] = useState("");
  const [negativePromptText, setNegativePromptText] = useState("");
  const [visionSummary, setVisionSummary] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- merges newly-added field defaults into live preview values whenever the schema changes, without ever discarding what the author has already typed
    setValues((prev) => {
      const defaults = defaultValuesFromSchema(schema);
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(defaults)) {
        if (!(key in next)) {
          next[key] = defaults[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [schema]);

  function handleChange(key: string, value: string | string[]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleReset() {
    setValues(defaultValuesFromSchema(schema));
    setPromptText("");
    setNegativePromptText("");
    setVisionSummary(null);
  }

  /**
   * AI Vision Generator sisteminin merkezi eşleme adımı (§7) — burada,
   * `schema`'yı zaten sahip olan tek yerde çağrılıyor. Yalnızca EŞLEŞEN
   * alanlar `values`'a yazılıyor (`{...prev, ...mapped.values}` —
   * eşleşmeyen alanlara hiç dokunulmuyor, kullanıcının önceden girdiği
   * hiçbir değer sessizce silinmiyor). AI'nin ürettiği `prompt` metni
   * SADECE Prompt kutusunun başlangıç değeri oluyor (§20) — kullanıcı
   * onu istediği gibi değiştirebilir (§9), ve final prompt yine mevcut
   * `composeFinalPromptText` motoru üzerinden (yukarıdaki `output`
   * hesaplaması, hiç değişmeden) üretiliyor.
   */
  function handleVisionResult(result: VisionAnalysisData) {
    const mapped = mapVisionResultToFieldValues(schema, result);
    setValues((prev) => ({ ...prev, ...mapped.values }));
    const promptSeed = readPromptSeed(result);
    if (promptSeed) setPromptText(promptSeed);
    if (enableNegativePrompt) {
      const negativeSeed = readNegativePromptSeed(result);
      if (negativeSeed) setNegativePromptText(negativeSeed);
    }
    setVisionSummary(
      mapped.matchedFieldKeys.length > 0
        ? `Analiz tamamlandı — ${mapped.matchedFieldKeys.length} alan otomatik dolduruldu. Aşağıdan istediğini değiştirebilirsin.`
        : "Analiz tamamlandı — görselden bu şemadaki alanlarla eşleşen bir değer çıkarılamadı, ama prompt metni dolduruldu.",
    );
  }

  // The single, shared source of truth both the JSON tab and the Prompt tab
  // (and `renderActions`) read from — the real JSON Output Engine call
  // (§18/§20's "central output engine" requirement). `promptText`/
  // `negativePromptText` are the runtime user's own direct input, written
  // into the output verbatim — this is the only place that happens.
  const output = buildGeneratorOutput(schema, values, promptText, negativePromptText, enableNegativePrompt);
  const prompt = typeof output.prompt === "string" ? output.prompt : "";
  const negativePrompt = enableNegativePrompt ? (typeof output.negative_prompt === "string" ? output.negative_prompt : "") : null;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Önizleme görünümü" className="flex gap-1 border-b border-border">
        {(["form", "json", "prompt"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === value ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {value === "form" ? "Form" : value === "json" ? "JSON" : "Prompt"}
          </button>
        ))}
      </div>

      {tab === "form" ? (
        <div className="space-y-5">
          <VisionAnalysisPanel onAnalyzed={handleVisionResult} />

          {visionSummary && (
            <div className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-text">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <p className="flex-1">{visionSummary}</p>
              <button
                type="button"
                onClick={() => setVisionSummary(null)}
                aria-label="Bu bilgiyi kapat"
                className="shrink-0 text-text-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="space-y-3 rounded-md border border-border bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Prompt</p>
            <div>
              <label htmlFor="gen-run-prompt" className="mb-1.5 block text-sm font-medium text-text">
                Prompt
              </label>
              <textarea
                id="gen-run-prompt"
                rows={3}
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                placeholder="Örn. Güneşli bir günde kadın oturuyor"
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
              />
            </div>
            {enableNegativePrompt && (
              <div>
                <label htmlFor="gen-run-negative-prompt" className="mb-1.5 block text-sm font-medium text-text">
                  Negative Prompt
                </label>
                <textarea
                  id="gen-run-negative-prompt"
                  rows={2}
                  value={negativePromptText}
                  onChange={(event) => setNegativePromptText(event.target.value)}
                  placeholder="Örn. sandalye yok"
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
                />
              </div>
            )}
          </div>
          <GeneratorRuntimeForm schema={schema} values={values} onChange={handleChange} />
        </div>
      ) : tab === "json" ? (
        <GeneratorJsonPanel output={output} onReset={handleReset} />
      ) : (
        <GeneratedPromptPanel prompt={prompt} negativePrompt={enableNegativePrompt ? negativePrompt : undefined} onReset={handleReset} />
      )}

      {renderActions?.({ values, prompt, negativePrompt })}
    </div>
  );
}
