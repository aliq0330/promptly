/**
 * Ortak Image Analysis sistemi — paylaşılan tipler.
 *
 * Tek bir Supabase Edge Function (`analyze-image`) üç farklı `mode` için
 * çalışıyor: `generator_builder`, `prompt_builder`, `prompt_request`. Her
 * modun kendi istek bağlamı (context) ve kendi sonuç şekli var — üçü de
 * burada, tek yerde tanımlı; Edge Function'ın kendi kaynak kodu (Deno,
 * `supabase/functions/analyze-image/index.ts`) bu dosyayı import EDEMİYOR
 * (ayrı bir runtime), bu yüzden şekiller orada elle senkron tutuluyor — bu
 * dosya yalnızca frontend'in TEK doğruluk kaynağı.
 */

export type ImageAnalysisMode = "generator_builder" | "prompt_builder" | "prompt_request";

/** `generator_builder` modunda Gemini'ye gönderilen, generatorun GERÇEK (creator-tanımlı) alan listesi — bkz. `GeneratorField` (types/index.ts). */
export interface GeneratorBuilderFieldContext {
  key: string;
  label: string;
  type: string;
  options?: string[];
}

export interface GeneratorBuilderContext {
  generator: { name: string; description: string; category: string };
  fields: GeneratorBuilderFieldContext[];
}

/** AI'nin önerdiği tip her zaman bu beşten biri — Generator'ın tam alan tipi kümesinin (11 tip) güvenli, belirsizliğe en az açık alt kümesi. */
export type SuggestedGeneratorFieldType = "text" | "select" | "multi_select" | "color" | "number";

export interface SuggestedGeneratorField {
  label: string;
  type: SuggestedGeneratorFieldType;
  options?: string[];
}

export interface GeneratorBuilderResult {
  /** Yalnızca gönderilen `fields` listesindeki GERÇEK `key`'lerle eşleşen girişler — icat edilmiş bir key asla dönmemeli, ama frontend yine de bunu doğrulayıp filtreliyor (bkz. `src/lib/generator-vision-mapping.ts`). */
  mappedValues: Record<string, string | string[]>;
  suggestedFields: SuggestedGeneratorField[];
}

export interface PromptBuilderResult {
  /** Kullanıcıya gösterilecek kısa, okunabilir analiz özeti (ör. `{ "Konu": "...", "Işık": "..." }`) — ham teknik rapor değil. */
  analysis: Record<string, string>;
  prompt: string;
  negativePrompt: string;
}

export interface PromptRequestResult {
  analysis: Record<string, string>;
  suggestedFields: {
    style?: string;
    subject?: string;
    colorPalette?: string;
    details?: string;
  };
  suggestedDescription: string;
}

export type ImageAnalysisResultFor<M extends ImageAnalysisMode> = M extends "generator_builder"
  ? GeneratorBuilderResult
  : M extends "prompt_builder"
    ? PromptBuilderResult
    : PromptRequestResult;
