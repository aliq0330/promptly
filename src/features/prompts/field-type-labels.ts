import type { TranslationKey } from "@/lib/i18n/translations";
import type { GeneratorFieldType } from "@/types";

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
