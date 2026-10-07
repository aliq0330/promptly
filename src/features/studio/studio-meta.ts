import { Blocks, SlidersHorizontal, SquareTerminal, Workflow as WorkflowIcon, type LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { StudioSnapshot } from "@/lib/studio-diff";
import type { StudioKind } from "./studio-model";

export const KIND_ICONS: Record<StudioKind, LucideIcon> = {
  prompt: SquareTerminal,
  generator: Blocks,
  preset: SlidersHorizontal,
  workflow: WorkflowIcon,
};

export const KIND_LABEL_KEYS: Record<StudioKind, TranslationKey> = {
  prompt: "studio.kind.prompt",
  generator: "studio.kind.generator",
  preset: "studio.kind.preset",
  workflow: "studio.kind.workflow",
};

/** Short title + subtitle shown on a source card/chip, derived from the live draft (so counts follow edits). */
export function describeSource(
  kind: StudioKind,
  draft: StudioSnapshot,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): { title: string; subtitle: string } {
  switch (kind) {
    case "prompt":
      return { title: draft.prompt?.title ?? "", subtitle: `${t("studio.sub.variables", { count: draft.prompt?.variables.length ?? 0 })} · ${t("studio.sub.sections", { count: draft.dna?.length ?? 0 })}` };
    case "generator":
      return { title: draft.generator?.title ?? "", subtitle: t("studio.sub.parameters", { count: draft.generator?.schema.fields.length ?? 0 }) };
    case "preset":
      return { title: draft.preset?.title ?? "", subtitle: t("studio.sub.presetApplied", { count: Object.keys(draft.preset?.selection ?? {}).length, total: draft.preset?.fields.length ?? 0 }) };
    case "workflow":
      return { title: draft.workflow?.title ?? "", subtitle: t("studio.sub.steps", { count: draft.workflow?.steps.length ?? 0 }) };
  }
}
