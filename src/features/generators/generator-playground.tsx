"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { defaultValuesFromSchema, isNegativeSection, renderTemplate } from "@/lib/generator-template";
import { GeneratorRuntimeForm } from "./generator-runtime-form";
import { GeneratedPromptPanel } from "./generated-prompt-panel";
import type { GeneratorSchema, GeneratorTemplate, GeneratorValues } from "@/types";

/**
 * The one real "fill the form → get a generated prompt" surface (§16/§20) —
 * shared, unmodified, by both the builder's own Live Preview pane and the
 * real public generator runtime page (CLAUDE.md §12/§13's "generator
 * creator ile generator user aynı runtime componentleri paylaşmalı", now
 * satisfied at this top level too, not just at the individual-field level
 * `generator-runtime-field.tsx` already covers). Owns its own `values`
 * state — new fields added while editing the schema get their default
 * merged in without discarding whatever the author has already typed into
 * existing fields (see the sync effect below); "Varsayılanlara dön" (from
 * `GeneratedPromptPanel`) fully resets to the schema's real defaults.
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
  const [tab, setTab] = useState<"form" | "prompt">("form");
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

  const positiveTemplate: GeneratorTemplate = { sections: template.sections.filter((section) => !isNegativeSection(section)) };
  const negativeTemplate: GeneratorTemplate = { sections: template.sections.filter((section) => isNegativeSection(section)) };
  const prompt = renderTemplate(positiveTemplate, values, schema);
  const negativePrompt = enableNegativePrompt ? renderTemplate(negativeTemplate, values, schema) : null;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Önizleme görünümü" className="flex gap-1 border-b border-border">
        {(["form", "prompt"] as const).map((value) => (
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
            {value === "form" ? "Form" : "Prompt"}
          </button>
        ))}
      </div>

      {tab === "form" ? (
        <GeneratorRuntimeForm schema={schema} values={values} onChange={handleChange} />
      ) : (
        <GeneratedPromptPanel prompt={prompt} negativePrompt={enableNegativePrompt ? negativePrompt : undefined} onReset={handleReset} />
      )}

      {renderActions?.({ values, prompt, negativePrompt })}
    </div>
  );
}
