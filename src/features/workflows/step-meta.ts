import { FileText, ImageIcon, Music, Video, Blocks, SquareTerminal, Sparkles, type LucideIcon } from "lucide-react";
import { taxonomyPathLabel, taxonomyLabel, type ContentTypeId } from "@/lib/content-taxonomy";
import type { Language } from "@/lib/i18n/translations";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { WorkflowStep, WorkflowStepType } from "@/types";

export const STEP_TYPE_META: Record<WorkflowStepType, { icon: LucideIcon; labelKey: TranslationKey }> = {
  prompt: { icon: SquareTerminal, labelKey: "search.kindPrompt" },
  generator: { icon: Blocks, labelKey: "generator.singular" },
  request: { icon: Sparkles, labelKey: "request.title" },
};

export const MEDIA_ICON: Record<ContentTypeId, LucideIcon> = { image: ImageIcon, text: FileText, audio: Music, video: Video };

/** "Metin · Pazarlama" from a step's linked content, or empty when nothing is linked / typed. */
export function stepSubtitle(step: WorkflowStep, language: Language): string {
  const c = step.content;
  if (!c?.contentType) return "";
  return taxonomyPathLabel({ contentType: c.contentType, category: c.category }, language);
}

export function categoryLabel(types: ContentTypeId[], slug: string | null, language: Language): string | null {
  if (!slug) return null;
  // Slugs are per content type; the first selected type that has this category names it.
  for (const type of types) {
    const label = taxonomyPathLabel({ contentType: type, category: slug }, language, false);
    if (label) return label;
  }
  return taxonomyLabel(slug, language);
}
