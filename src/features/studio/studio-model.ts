import { fetchDnaSections } from "@/lib/supabase/prompt-dna";
import { fetchPromptById } from "@/lib/supabase/prompts";
import { fetchVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { fetchGeneratorById, fetchGeneratorBySlug, fetchGeneratorVersion } from "@/lib/supabase/generators";
import { fetchPresetById } from "@/lib/supabase/presets";
import { fetchWorkflowById } from "@/lib/supabase/workflows";
import { buildGeneratorOutput } from "@/lib/generator-output";
import { defaultValuesFromSchema } from "@/lib/generator-template";
import { composePrompt } from "@/lib/preset-fields";
import { resolvePresetFields } from "@/lib/preset-utils";
import { resolvePromptText } from "@/lib/prompt-variables";
import type { Language } from "@/lib/i18n/translations";
import type { DnaSection } from "@/lib/prompt-dna/types";
import type { StudioSnapshot } from "@/lib/studio-diff";
import type { Generator, GeneratorOutput, GeneratorTemplate, Preset, Prompt, Workflow } from "@/types";

export type StudioKind = "prompt" | "dna" | "generator" | "preset" | "workflow";
export const STUDIO_KINDS: StudioKind[] = ["prompt", "dna", "generator", "preset", "workflow"];

/** The ORIGINAL records a Studio session is attached to. Studio never writes to any of them. */
export interface StudioSources {
  prompt?: { prompt: Prompt };
  dna?: { promptId: string; title: string; contentType: string };
  generator?: { generator: Generator; template: GeneratorTemplate };
  preset?: { preset: Preset };
  workflow?: { workflow: Workflow };
}

export interface StudioVersion {
  id: string;
  number: number;
  label: string;
  snapshot: StudioSnapshot;
  createdAt: string;
  /** The untouched "Orijinal" version created when the first source is attached. */
  original: boolean;
}

export type LoadedSource =
  | { kind: "prompt"; source: NonNullable<StudioSources["prompt"]>; piece: NonNullable<StudioSnapshot["prompt"]> }
  | { kind: "dna"; source: NonNullable<StudioSources["dna"]>; piece: DnaSection[] }
  | { kind: "generator"; source: NonNullable<StudioSources["generator"]>; piece: NonNullable<StudioSnapshot["generator"]> }
  | { kind: "preset"; source: NonNullable<StudioSources["preset"]>; piece: NonNullable<StudioSnapshot["preset"]> }
  | { kind: "workflow"; source: NonNullable<StudioSources["workflow"]>; piece: NonNullable<StudioSnapshot["workflow"]> };

/** A reference to a library item: prompt/dna/preset/workflow by id, generator by slug (or id). */
export interface StudioRef {
  kind: StudioKind;
  id: string;
}

/**
 * Loads one source (plus, when `withDna` is set, a prompt's DNA as a separate DNA source when
 * it has one) from the real library. Returns [] if it can't be found/read.
 */
export async function loadStudioSource(ref: StudioRef, opts: { withDna?: boolean } = {}): Promise<LoadedSource[]> {
  if (ref.kind === "prompt" || ref.kind === "dna") {
    const prompt = await fetchPromptById(ref.id);
    if (!prompt || prompt.deletedAt) return [];
    const out: LoadedSource[] = [];
    if (ref.kind === "prompt") {
      const variables = await fetchVariablesForPrompt(prompt.id);
      out.push({
        kind: "prompt",
        source: { prompt },
        piece: { title: prompt.title, text: prompt.promptText, variables: variables.map((v) => ({ name: v.name, value: v.defaultValue })) },
      });
    }
    if (ref.kind === "dna" || opts.withDna === true) {
      const sections = await fetchDnaSections(prompt.id);
      if (sections.length > 0 || ref.kind === "dna") out.push({ kind: "dna", source: { promptId: prompt.id, title: prompt.title, contentType: prompt.contentType }, piece: sections });
    }
    return out;
  }

  if (ref.kind === "generator") {
    const generator = (await fetchGeneratorBySlug(ref.id)) ?? (await fetchGeneratorById(ref.id));
    if (!generator) return [];
    const version = generator.currentVersionId ? await fetchGeneratorVersion(generator.currentVersionId) : null;
    if (!version) return [];
    return [
      {
        kind: "generator",
        source: { generator, template: version.template },
        piece: { title: generator.title, schema: version.schema, values: defaultValuesFromSchema(version.schema) },
      },
    ];
  }

  if (ref.kind === "preset") {
    const preset = await fetchPresetById(ref.id);
    if (!preset) return [];
    // The preset's values are NOT applied on attach — "Uygula" does that, so the change is visible and undoable.
    return [{ kind: "preset", source: { preset }, piece: { title: preset.title, fields: resolvePresetFields(preset), selection: {} } }];
  }

  const loaded = await fetchWorkflowById(ref.id);
  if (!loaded) return [];
  return [{ kind: "workflow", source: { workflow: loaded.workflow }, piece: { title: loaded.workflow.title, steps: loaded.steps } }];
}

export interface StudioResult {
  /** Final prompt text assembled from the draft (variables → preset → generator), or "" when nothing yields prompt text. */
  text: string;
  negativeText: string | null;
  /** Generator's structured JSON, when a generator is attached. */
  json: GeneratorOutput | null;
}

/** Everything the result pane shows is derived here, deterministically and locally — no AI call. */
export function composeStudioResult(draft: StudioSnapshot, language: Language, enableNegativePrompt: boolean): StudioResult {
  let base = "";
  if (draft.prompt) {
    const values = Object.fromEntries(draft.prompt.variables.map((v) => [v.name, v.value]));
    base = draft.prompt.variables.length > 0 ? resolvePromptText(draft.prompt.text, values) : draft.prompt.text;
  }
  if (draft.preset && Object.keys(draft.preset.selection).length > 0) {
    base = composePrompt(base, draft.preset.selection, draft.preset.fields, language);
  }
  if (draft.generator) {
    const output = buildGeneratorOutput(draft.generator.schema, draft.generator.values, base, "", enableNegativePrompt);
    return {
      text: typeof output.prompt === "string" ? output.prompt : base,
      negativeText: typeof output.negative_prompt === "string" && output.negative_prompt ? output.negative_prompt : null,
      json: output,
    };
  }
  if (!base && draft.dna && draft.dna.length > 0) {
    base = draft.dna
      .filter((s) => s.content.trim())
      .map((s) => s.content.trim())
      .join(", ");
  }
  return { text: base, negativeText: null, json: null };
}
