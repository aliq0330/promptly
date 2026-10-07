"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import { reflectDnaEdit, type StudioSnapshot } from "@/lib/studio-diff";
import type { DnaSection } from "@/lib/prompt-dna/types";
import { PromptDnaEditor } from "@/features/prompts/prompt-dna-editor";

type Update = (fn: (draft: StudioSnapshot) => StudioSnapshot, key?: string | null) => void;

/**
 * The existing Prompt DNA editor (the "DNA" tab of the prompt editor), bound to the Studio draft. When a section's
 * text changes and its old text appears in the DRAFT prompt, the draft prompt
 * follows (so the result preview moves); the original prompt is never written.
 */
export function DnaEditor({ draft, contentType, edit }: { draft: StudioSnapshot; contentType: string; edit: Update }) {
  const { t } = useTranslation();
  const sections = draft.dna ?? [];
  const promptText = draft.prompt?.text ?? sections.map((s) => s.content).join(", ");

  function handleChange(next: DnaSection[]) {
    edit((d) => {
      const previous = d.dna ?? [];
      let text = d.prompt?.text;
      if (text !== undefined) {
        for (const section of next) {
          const before = previous.find((p) => p.id === section.id);
          if (!before || before.content === section.content) continue;
          text = reflectDnaEdit(text, before.content, section.content).text;
        }
      }
      return { ...d, dna: next, prompt: d.prompt && text !== undefined ? { ...d.prompt, text } : d.prompt };
    }, "dna");
  }

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-surface-soft p-3 text-caption text-text-secondary">{t("studio.dnaHint")}</p>
      <PromptDnaEditor promptText={promptText} contentType={contentType} sections={sections} onChange={handleChange} />
    </div>
  );
}
