import { FileText, ImageIcon, Music, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PromptContentType } from "@/types";

/**
 * Static, app-provided category names — not user content, so they carry a
 * `labelKey` (looked up via `useTranslation().t()` at every render site)
 * instead of a hardcoded string, same as `GENERATOR_CATEGORY_TOPIC_LABELS`.
 */
export const CONTENT_TYPE_META: Record<PromptContentType, { icon: LucideIcon; labelKey: TranslationKey }> = {
  image: { icon: ImageIcon, labelKey: "contentType.image" },
  text: { icon: FileText, labelKey: "contentType.text" },
  audio: { icon: Music, labelKey: "contentType.audio" },
  video: { icon: Video, labelKey: "contentType.video" },
};
