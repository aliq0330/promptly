import { Code2, Feather, FileText, ImageIcon, Megaphone, Music, PenTool, Shapes, Video, type LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { GeneratorCategoryTopic, GeneratorFieldType } from "@/types";

/**
 * Display labels (via translation key, looked up with `useTranslation().t()`
 * at each render site) for the fixed `GeneratorCategoryTopic` enum
 * (§39/§76's "generic, not just image" requirement — this is the top-level
 * TOPIC a generator belongs to, e.g. for `/generators` filtering; it is NOT
 * the user-defined `GeneratorCategory` groups inside a generator's own
 * schema, which have completely free-form names).
 */
export const GENERATOR_CATEGORY_TOPIC_LABELS: Record<GeneratorCategoryTopic, TranslationKey> = {
  image: "generatorTopic.image",
  text: "generatorTopic.text",
  video: "generatorTopic.video",
  audio: "generatorTopic.audio",
  code: "generatorTopic.code",
  design: "generatorTopic.design",
  marketing: "generatorTopic.marketing",
  writing: "generatorTopic.writing",
  other: "generatorTopic.other",
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

/**
 * Display labels for a generator field's TYPE (text/select/slider/…) — was
 * three separate, identical hardcoded-Turkish `Record<GeneratorFieldType,
 * string>` copies (`field-list.tsx`, `field-catalog-picker.tsx`,
 * `field-editor-modal.tsx`); consolidated into one shared, translated
 * source so all three render sites stay in sync.
 */
export const GENERATOR_FIELD_TYPE_LABELS: Record<GeneratorFieldType, TranslationKey> = {
  text: "fieldType.text",
  textarea: "fieldType.textarea",
  select: "fieldType.select",
  multi_select: "fieldType.multiSelect",
  number: "fieldType.number",
  slider: "fieldType.slider",
  color: "fieldType.color",
  checkbox: "fieldType.checkbox",
  toggle: "fieldType.toggle",
  radio: "fieldType.radio",
  url: "fieldType.url",
};
