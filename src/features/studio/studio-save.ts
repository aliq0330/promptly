import { createDraftGenerator, saveDraftVersionContent } from "@/lib/supabase/generators";
import { replaceDnaSections } from "@/lib/supabase/prompt-dna";
import { replaceVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import type { CreateRealPromptInput } from "@/lib/supabase/prompts";
import { saveWorkflow } from "@/lib/supabase/workflows";
import { composePrompt } from "@/lib/preset-fields";
import { newId } from "@/lib/workflow-logic";
import type { Language } from "@/lib/i18n/translations";
import type { StudioSnapshot } from "@/lib/studio-diff";
import type { Prompt, PromptContentType, UserProfile, WorkflowStep } from "@/types";
import type { StudioResult, StudioSources } from "./studio-model";

export type SaveTarget = "prompt" | "generator" | "workflow";

/** Which "Yeni olarak oluştur" targets the current draft can actually produce. */
export function availableTargets(draft: StudioSnapshot, result: StudioResult): Record<SaveTarget, boolean> {
  return {
    prompt: Boolean(draft.prompt) || result.text.trim() !== "",
    generator: Boolean(draft.generator),
    workflow: Boolean(draft.workflow),
  };
}

export function defaultNewTitle(target: SaveTarget, draft: StudioSnapshot, suffix: string): string {
  const base = target === "prompt" ? draft.prompt?.title : target === "generator" ? draft.generator?.title : draft.workflow?.title;
  return `${base ?? ""} ${suffix}`.trim();
}

/** Always a DRAFT, always a brand-new row — the original is never updated. The author reviews/publishes it from the normal editor. */
export async function savePromptAsNew(args: {
  title: string;
  draft: StudioSnapshot;
  sources: StudioSources;
  result: StudioResult;
  language: Language;
  profile: UserProfile;
  addPrompt: (input: CreateRealPromptInput, profile: UserProfile) => Promise<Prompt>;
}): Promise<string> {
  const { draft, sources, result, language } = args;
  const origin = sources.prompt?.prompt;
  const text = draft.prompt
    ? draft.preset && Object.keys(draft.preset.selection).length > 0
      ? composePrompt(draft.prompt.text, draft.preset.selection, draft.preset.fields, language)
      : draft.prompt.text
    : result.text;
  const contentType: PromptContentType = origin?.contentType ?? sources.generator?.generator.contentType ?? sources.preset?.preset.contentType ?? "text";
  const created = await args.addPrompt(
    {
      title: args.title.trim(),
      description: origin?.description ?? "",
      promptText: text,
      tool: origin?.tool ?? null,
      tools: origin?.tools ?? sources.generator?.generator.tools ?? sources.preset?.preset.tools ?? [],
      contentType,
      category: origin?.category ?? sources.generator?.generator.category ?? sources.preset?.preset.category ?? null,
      subcategory: origin?.subcategory ?? sources.generator?.generator.subcategory ?? sources.preset?.preset.subcategory ?? null,
      tags: origin?.tags ?? [],
      images: [],
      visibility: "private",
      isDraft: true,
    },
    args.profile,
  );
  if (draft.prompt && draft.prompt.variables.length > 0) {
    await replaceVariablesForPrompt(
      created.id,
      draft.prompt.variables.map((v) => ({ name: v.name, defaultValue: v.value, description: null })),
    );
  }
  if (draft.dna && draft.dna.length > 0) await replaceDnaSections(created.id, draft.dna);
  return created.id;
}

export async function saveGeneratorAsNew(args: { title: string; draft: StudioSnapshot; sources: StudioSources; profile: UserProfile }): Promise<string> {
  const source = args.sources.generator;
  const piece = args.draft.generator;
  if (!source || !piece) throw new Error("no generator");
  const g = source.generator;
  // The values chosen in Studio become the new generator's defaults.
  const schema = { ...piece.schema, fields: piece.schema.fields.map((f) => ({ ...f, defaultValue: piece.values[f.key] ?? f.defaultValue })) };
  const { generator, version } = await createDraftGenerator(
    {
      title: args.title.trim(),
      description: g.description,
      media: [],
      tools: g.tools,
      contentType: g.contentType,
      category: g.category,
      subcategory: g.subcategory,
      tags: g.tags,
      visibility: "private",
      allowPromptEditing: g.allowPromptEditing,
      allowSavingGeneratedPrompts: g.allowSavingGeneratedPrompts,
      enableNegativePrompt: g.enableNegativePrompt,
    },
    args.profile.id,
    args.profile,
  );
  await saveDraftVersionContent(version.id, schema, source.template);
  return generator.id;
}

/** Fresh ids for every step/input/output, with link sources remapped, so the copy shares no rows with the original. */
export function cloneStepsWithNewIds(steps: WorkflowStep[]): WorkflowStep[] {
  const stepIds = new Map(steps.map((s) => [s.id, newId()]));
  const outputIds = new Map<string, string>();
  for (const step of steps) for (const output of step.outputs) outputIds.set(`${step.id}:${output.id}`, newId());
  return steps.map((step) => ({
    ...step,
    id: stepIds.get(step.id)!,
    outputs: step.outputs.map((o) => ({ ...o, id: outputIds.get(`${step.id}:${o.id}`)! })),
    inputs: step.inputs.map((input) => ({
      ...input,
      id: newId(),
      source:
        input.source && stepIds.has(input.source.stepId) && outputIds.has(`${input.source.stepId}:${input.source.outputId}`)
          ? { stepId: stepIds.get(input.source.stepId)!, outputId: outputIds.get(`${input.source.stepId}:${input.source.outputId}`)! }
          : null,
    })),
  }));
}

export async function saveWorkflowAsNew(args: { title: string; draft: StudioSnapshot; sources: StudioSources; profile: UserProfile }): Promise<string> {
  const source = args.sources.workflow;
  const piece = args.draft.workflow;
  if (!source || !piece) throw new Error("no workflow");
  const w = source.workflow;
  return saveWorkflow(
    {
      id: null,
      title: args.title.trim(),
      description: w.description,
      media: [],
      contentTypes: w.contentTypes,
      category: w.category,
      subcategory: w.subcategory,
      tools: w.tools,
      tags: w.tags,
      status: "draft",
      visibility: "private",
      steps: cloneStepsWithNewIds(piece.steps),
    },
    args.profile.id,
  );
}

export function editHrefFor(target: SaveTarget, id: string): string {
  if (target === "prompt") return `/create?edit=${id}`;
  if (target === "generator") return `/generators/create?edit=${id}`;
  return `/workflows/create?edit=${id}`;
}
