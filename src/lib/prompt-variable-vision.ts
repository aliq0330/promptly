/**
 * Görselden değişken çıkarma (CLAUDE.md §9.145, 1e) — mevcut `analyze-image`
 * Edge Function'ının `generator_builder` modunu OLDUĞU GİBİ kullanır (yeniden
 * deploy gerekmez): değişkenler "alan" gibi gönderilir, dönen eşleşen
 * değerler değişkenlerin varsayılanı, önerilen yeni alanlar yeni değişkenler
 * olur. Bu dosya yalnızca saf, DOM'suz dönüşümleri içerir; hiçbir şeyi
 * kendiliğinden uygulamaz — uygulama kullanıcı onayıyla bileşende olur.
 */
import { resolveGeneratorVisionMapping, sanitizeSuggestedFields, type CleanSuggestedField } from "./generator-vision-mapping.ts";
import { catalogFieldToVariable, uniqueVariableName, type VariableDraftData } from "./prompt-variable-catalog.ts";
import { MULTI_SEPARATOR, isChoiceType } from "./prompt-variable-types.ts";
import type { GeneratorBuilderFieldContext, GeneratorBuilderResult } from "./image-analysis-types.ts";
import type { GeneratorField, PromptVariableSpec } from "@/types";

/** Görsel analizine gönderilebilen bir değişkenin kesiti. */
export interface VisionVariable extends PromptVariableSpec {
  name: string;
}

/** Aç/kapa değişkenleri görselden çıkarılamaz, bağlama hiç konmaz. */
function analyzable(variables: VisionVariable[]): VisionVariable[] {
  return variables.filter((variable) => variable.type !== "toggle");
}

/** Edge Function'a giden alan listesi: değişken adı = alan anahtarı. */
export function variablesToVisionContext(variables: VisionVariable[]): GeneratorBuilderFieldContext[] {
  return analyzable(variables).map((variable) => ({
    key: variable.name,
    label: variable.name.replace(/_/g, " "),
    type: variable.type === "slider" ? "number" : variable.type,
    options: isChoiceType(variable.type) ? variable.options.map((option) => option.label) : undefined,
  }));
}

/** `resolveGeneratorVisionMapping`'in beklediği alan şekli (yalnızca kullandığı kısım). */
function asGeneratorField(variable: VisionVariable): GeneratorField {
  return {
    key: variable.name,
    label: variable.name,
    type: variable.type === "slider" ? "number" : variable.type,
    options: variable.options,
    min: variable.config.min ?? null,
    max: variable.config.max ?? null,
  } as GeneratorField;
}

export interface MatchedVariableValue {
  name: string;
  /** Değişkenin yeni varsayılanı — prompt'a yazılan değer (seçenek `value`'su). */
  value: string;
  /** Kullanıcıya gösterilen okunur hali (seçenek adları). */
  display: string;
}

/**
 * AI'nin döndürdüğü eşleşmeleri doğrular: seçenekli değişkende yalnızca
 * gerçek bir seçenekle eşleşen değer, sayıda aralığa sıkıştırılmış sayı kabul
 * edilir; icat edilmiş seçenek asla yazılmaz.
 */
export function resolveVariableVisionValues(variables: VisionVariable[], result: GeneratorBuilderResult): MatchedVariableValue[] {
  const subset = analyzable(variables);
  const mapping = resolveGeneratorVisionMapping(subset.map(asGeneratorField), result);
  const out: MatchedVariableValue[] = [];
  for (const variable of subset) {
    const raw = mapping.values[variable.name];
    if (raw === undefined) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    // Çoklu seçimde seçenek sırası korunur.
    const ordered = variable.type === "multi_select" ? variable.options.filter((o) => list.includes(o.value)).map((o) => o.value) : list;
    const value = ordered.join(MULTI_SEPARATOR);
    const display = isChoiceType(variable.type)
      ? ordered.map((v) => variable.options.find((o) => o.value === v)?.label ?? v).join(MULTI_SEPARATOR)
      : value;
    out.push({ name: variable.name, value, display });
  }
  return out;
}

/** Önerilen yeni alanlar: mevcut değişkenlerle çakışanlar atılır, en fazla 6, tipi geçerli. */
export function cleanVisionSuggestions(result: GeneratorBuilderResult, variables: VisionVariable[]): CleanSuggestedField[] {
  return sanitizeSuggestedFields(
    result.suggestedFields,
    variables.map((variable) => ({ label: variable.name.replace(/_/g, " ") }) as GeneratorField),
  );
}

/** Önerilen alanı, `taken` ile çakışmayan adla bir değişken taslağına çevirir (renk önerisi metin olur, görsel/renk eklenmez). */
export function suggestionToVariable(suggestion: CleanSuggestedField, taken: Set<string>): VariableDraftData {
  return catalogFieldToVariable(
    { label: suggestion.label, type: suggestion.type, options: suggestion.options },
    taken,
  );
}

export { uniqueVariableName };
