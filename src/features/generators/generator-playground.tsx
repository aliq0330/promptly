"use client";

import { Braces, SlidersHorizontal, SquareTerminal } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";

import { useEffect, useState } from "react";
import { defaultValuesFromSchema } from "@/lib/generator-template";
import { buildGeneratorOutput } from "@/lib/generator-output";
import { useTranslation } from "@/lib/i18n/language-provider";
import { GeneratorRuntimeForm } from "./generator-runtime-form";
import { GeneratedPromptPanel } from "./generated-prompt-panel";
import { GeneratorJsonPanel } from "./generator-json-panel";
import { ScrollablePrompt } from "@/features/content/scrollable-prompt";
import { toDisplayText } from "@/lib/generator-template-doc";
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
 *
 * This component has NO image-analysis/AI assist of its own — it is shared
 * verbatim by both the builder's Live Preview and the real public runtime
 * page, and the Image Analysis system's Generator mode (`GeneratorVisionAssist`,
 * "Görselden Alanları Doldur") is deliberately kept OUT of it: that assist
 * needs write access to the generator's own `schema` (to add new fields via
 * the existing custom-field system), which this component doesn't own, and
 * it must never appear on the real runtime page. It lives instead directly
 * in `generator-builder.tsx`'s "Alanlar" step.
 */
export function GeneratorPlayground({
  schema,
  templateText = "",
  showCreatorPrompt = false,
  renderActions,
}: {
  schema: GeneratorSchema;
  /** Yazarın isteğe bağlı prompt şablonu (kanonik `{{anahtar}}`); boşsa davranış öncekiyle aynı. */
  templateText?: string;
  /** Real runtime page only: shows the creator's prepared prompt (read-only) above the fields. */
  showCreatorPrompt?: boolean;
  /** Only the real runtime page passes this — the "Prompt olarak aç"/"Kaydet" buttons, given the exact live-computed state to act on. The builder's own preview passes nothing. */
  renderActions?: (state: { values: GeneratorValues; prompt: string; negativePrompt: string | null }) => React.ReactNode;
}) {
  const { t } = useTranslation();
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
  // (§18/§20's "central output engine" requirement). `promptText`/
  // `negativePromptText` are the runtime user's own direct input, written
  // into the output verbatim — this is the only place that happens.
  const output = buildGeneratorOutput(schema, values, "", "", false, templateText);
  const prompt = typeof output.prompt === "string" ? output.prompt : "";
  const negativePrompt: string | null = null;

  return (
    <div className="space-y-4">
      <Tabs
        items={[
          { key: "form", label: "Form", icon: SlidersHorizontal },
          { key: "json", label: "JSON", icon: Braces },
          { key: "prompt", label: "Prompt", icon: SquareTerminal },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel={t("generator.previewViewAriaLabel")}
        variant="segmented"
      />

      {tab === "form" ? (
        <div className="space-y-5">
          {showCreatorPrompt && templateText.trim() && (
            <section aria-labelledby="creator-prompt-title" className="space-y-1.5">
              <h3 id="creator-prompt-title" className="text-label font-medium text-text-secondary">
                {t("generator.creatorPromptTitle")}
              </h3>
              <ScrollablePrompt className="rounded-lg border border-border-soft bg-surface-soft p-3 text-small text-text">
                {toDisplayText(templateText, schema.fields)}
              </ScrollablePrompt>
            </section>
          )}
          <GeneratorRuntimeForm schema={schema} values={values} onChange={handleChange} />
        </div>
      ) : tab === "json" ? (
        <GeneratorJsonPanel output={output} onReset={handleReset} />
      ) : (
        <GeneratedPromptPanel prompt={prompt} onReset={handleReset} />
      )}

      {renderActions?.({ values, prompt, negativePrompt })}
    </div>
  );
}
