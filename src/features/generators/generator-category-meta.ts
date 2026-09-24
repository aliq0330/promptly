import { Code2, Feather, FileText, ImageIcon, Megaphone, Music, PenTool, Shapes, Video, type LucideIcon } from "lucide-react";
import type { GeneratorCategoryTopic } from "@/types";

/**
 * Turkish display labels for the fixed `GeneratorCategoryTopic` enum
 * (§39/§76's "generic, not just image" requirement — this is the top-level
 * TOPIC a generator belongs to, e.g. for `/generators` filtering; it is NOT
 * the user-defined `GeneratorCategory` groups inside a generator's own
 * schema, which have completely free-form names).
 */
export const GENERATOR_CATEGORY_TOPIC_LABELS: Record<GeneratorCategoryTopic, string> = {
  image: "Görsel",
  text: "Metin",
  video: "Video",
  audio: "Ses / Müzik",
  code: "Kod",
  design: "Tasarım",
  marketing: "Pazarlama",
  writing: "Yazarlık",
  other: "Diğer",
};

export const GENERATOR_CATEGORY_TOPICS = Object.keys(GENERATOR_CATEGORY_TOPIC_LABELS) as GeneratorCategoryTopic[];

/** One icon per topic, used by filter chips and card type labels. */
export const GENERATOR_CATEGORY_TOPIC_ICONS: Record<GeneratorCategoryTopic, LucideIcon> = {
  image: ImageIcon,
  text: FileText,
  video: Video,
  audio: Music,
  code: Code2,
  design: PenTool,
  marketing: Megaphone,
  writing: Feather,
  other: Shapes,
};
