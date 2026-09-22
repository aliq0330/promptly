"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { defaultValuesFromSchema } from "@/lib/generator-template";
import { buildGeneratorOutput } from "@/lib/generator-output";
import { GeneratorRuntimeForm } from "./generator-runtime-form";
import { GeneratedPromptPanel } from "./generated-prompt-panel";
import { GeneratorJsonPanel } from "./generator-json-panel";
import type { GeneratorSchema, GeneratorTemplate, GeneratorValues } from "@/types";

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
 * Three tabs, per the JSON Output Engine architecture correction: FORM
 * (fill it in), JSON (the generator's real, structured output —
 * `buildGeneratorOutput()`, the primary artifact), and PROMPT (a
 * human-readable view of just that JSON's own `prompt` property — never
 * the other way around). Both the JSON and Prompt tabs are computed from
 * the exact same `buildGeneratorOutput()` call — there is only ever one
 * source of truth, the two tabs are just two different views onto it.
 */
export function GeneratorPlayground({
  schema,
  template,
  enableNegativePrompt,
  renderActions,
}: {
  schema: GeneratorSchema;
  template: GeneratorTemplate;
  enableNegativePrompt: boolean;
  /** Only the real runtime page passes this — the "Prompt olarak aç"/"Kaydet" buttons, given the exact live-computed state to act on. The builder's own preview passes nothing. */
  renderActions?: (state: { values: GeneratorValues; prompt: string; negativePrompt: string | null }) => React.ReactNode;
}) {
  const [tab, setTab] = useState<"form" | "json" | "prompt">("form");
  const [values, setValues] = useState<GeneratorValues>(() => defaultValuesFromSchema(schema));

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
  }

  // The single, shared source of truth both the JSON tab and the Prompt tab
  // (and `renderActions`) read from — the real JSON Output Engine call
  // (§18/§20's "central output engine" requirement). The old code called
  // `renderTemplate()` twice, directly, right here — that's exactly the
  // "selection inserted straight into a single prompt string" pattern the
  // architecture correction (§22) asked to find and fix; it now happens
  // exclusively inside `buildGeneratorOutput()`, one layer down, with the
  // template engine's result written into the JSON's own `prompt`/
  // `negative_prompt` properties rather than being the final output itself.
  const output = buildGeneratorOutput(schema, template, values, enableNegativePrompt);
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
        <GeneratorRuntimeForm schema={schema} values={values} onChange={handleChange} />
      ) : tab === "json" ? (
        <GeneratorJsonPanel output={output} onReset={handleReset} />
      ) : (
        <GeneratedPromptPanel prompt={prompt} negativePrompt={enableNegativePrompt ? negativePrompt : undefined} onReset={handleReset} />
      )}

      {renderActions?.({ values, prompt, negativePrompt })}
    </div>
  );
}
