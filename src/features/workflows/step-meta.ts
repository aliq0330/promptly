import type { IconComponent } from "@/components/icons/icon";
import { FileText } from "@/components/icons/file-text";
import { ImageIcon } from "@/components/icons/image-icon";
import { Music } from "@/components/icons/music";
import { Video } from "@/components/icons/video";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Sparkles } from "@/components/icons/sparkles";
import { taxonomyPathLabel, taxonomyLabel, type ContentTypeId } from "@/lib/content-taxonomy";
import type { Language } from "@/lib/i18n/translations";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { WorkflowStep, WorkflowStepType } from "@/types";

export const STEP_TYPE_META: Record<WorkflowStepType, { icon: IconComponent; labelKey: TranslationKey }> = {
  prompt: { icon: SquareTerminal, labelKey: "search.kindPrompt" },
  request: { icon: Sparkles, labelKey: "request.title" },
};

export const MEDIA_ICON: Record<ContentTypeId, IconComponent> = { image: ImageIcon, text: FileText, audio: Music, video: Video };

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
