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
