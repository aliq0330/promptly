/**
 * Görsel Analiz → Generator alanı uygulama katmanı (Generator Builder'ın
 * "Görselden Alanları Doldur" özelliği). Artık AI'nin KENDİSİ (Edge
 * Function'a gönderilen gerçek `GeneratorField` listesi sayesinde) hangi
 * alanın hangi değere karşılık geldiğine karar veriyor —
 * `GeneratorBuilderResult.mappedValues` doğrudan gerçek `field.key`'lerle
 * geliyor. Bu dosyanın işi yalnızca:
 *   1. AI'nin döndürdüğü ham değeri, alanın GERÇEK tipine göre güvenli bir
 *      runtime değerine çevirmek (select/radio/multi_select yalnızca gerçek
 *      bir seçenekle eşleşirse dolduruluyor — icat edilmiş bir seçenek asla
 *      yazılmıyor),
 *   2. AI'nin önerdiği yeni alanları, zaten var olan alanlarla
 *      çakışmayacak, geçerli tipte, makul sayıda bir listeye
 *      sadeleştirmek.
 * Hiçbiri şemayı DEĞİŞTİRMİYOR — yalnızca saf, DOM'suz veri dönüşümü.
 * Şemaya gerçek yazma (`setSchema`) çağıranın (`generator-builder.tsx`)
 * işi, ve yalnızca kullanıcı açıkça onayladığında oluyor.
 */

import type { GeneratorField, GeneratorFieldOption } from "@/types";
import type {
  GeneratorBuilderResult,
  SuggestedGeneratorField,
  SuggestedGeneratorFieldType,
} from "@/lib/image-analysis-types";

/**
 * Bu proje her yerde Türkçe etiketli, Türkçe-slug değerli `select`
 * seçenekleri kullanıyor (`generator-field-catalog.ts`), ama Gemini Vision
 * sonuçları genelde İngilizce dönebiliyor ("brown", "male"). Tam bir çeviri
 * sistemi kapsam dışı — yalnızca portre/karakter analizinde en sık geçen,
 * somut terimler için küçük bir TR-EN köprüsü.
 */
const EN_TR_ALIASES: Record<string, string> = {
  brown: "kahverengi",
  blue: "mavi",
  green: "yeşil",
  gray: "gri",
  grey: "gri",
  black: "siyah",
  blonde: "sarı",
  blond: "sarı",
  red: "kızıl",
  white: "beyaz",
  hazel: "ela",
  amber: "amber",
  purple: "mor",
  male: "erkek",
  man: "erkek",
  female: "kadın",
  woman: "kadın",
  child: "çocuk",
  young: "genç",
  adult: "yetişkin",
  elderly: "yaşlı",
  old: "yaşlı",
  light: "açık",
  dark: "koyu",
  medium: "orta",
  fair: "açık",
  tan: "buğday",
  oval: "oval",
  round: "yuvarlak",
  square: "kare",
  long: "uzun",
  short: "kısa",
  curly: "kıvırcık",
  straight: "düz",
  wavy: "dalgalı",
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

function optionMatches(candidateValue: string, optionLabel: string, optionValue: string): boolean {
  const normCandidate = normalize(candidateValue);
  const normAlias = normalize(EN_TR_ALIASES[candidateValue.trim().toLowerCase()] ?? "");
  const normLabel = normalize(optionLabel);
  const normValue = normalize(optionValue);
  if (!normCandidate) return false;
  if (normCandidate === normLabel || normCandidate === normValue) return true;
  if (normAlias && (normAlias === normLabel || normAlias === normValue)) return true;
  if (normCandidate.length >= 3 && (normLabel.includes(normCandidate) || normCandidate.includes(normLabel))) return true;
  return false;
}

/**
 * AI'nin bir alan için döndürdüğü ham değeri (string veya string[]),
 * alanın GERÇEK tipine göre güvenli bir runtime değerine çevirir. Eşleşme
 * yoksa/uygun değilse `null` döner — çağıran bu durumda o alana hiç
 * dokunmuyor.
 */
function coerceValueForField(field: GeneratorField, raw: string | string[]): string | string[] | null {
  const rawList = Array.isArray(raw) ? raw.filter((v) => typeof v === "string" && v.trim()) : [raw];
  const rawJoined = rawList.join(", ").trim();
  if (rawList.length === 0) return null;

  switch (field.type) {
    case "select":
    case "radio": {
      for (const candidate of rawList) {
        const option = field.options.find((o) => optionMatches(candidate, o.label, o.value));
        if (option) return option.value;
      }
      return null;
    }
    case "multi_select": {
      const matched = new Set<string>();
      for (const candidate of rawList) {
        const option = field.options.find((o) => optionMatches(candidate, o.label, o.value));
        if (option) matched.add(option.value);
      }
      return matched.size > 0 ? Array.from(matched) : null;
    }
    case "color": {
      const hexCandidate = rawList.find((v) => /^#?[0-9a-fA-F]{6}$/.test(v.trim()));
      if (!hexCandidate) return null;
      const trimmed = hexCandidate.trim();
      return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    }
    case "number":
    case "slider": {
      const match = rawJoined.match(/-?\d+(\.\d+)?/);
      if (!match) return null;
      let n = Number(match[0]);
      if (field.min !== null) n = Math.max(field.min, n);
      if (field.max !== null) n = Math.min(field.max, n);
      return String(n);
    }
    case "checkbox":
    case "toggle":
      // AI çıktısından güvenle bir "işaretli/işaretsiz" durumu çıkarılamaz —
      // bilinçli olarak eşlenmiyor.
      return null;
    default:
      return rawJoined.length > 0 ? rawJoined : null;
  }
}

export interface GeneratorVisionMappingResult {
  /** `field.key` → geçerli, uygulanmaya hazır değer. */
  values: Record<string, string | string[]>;
  matchedFieldKeys: string[];
}

/**
 * `GeneratorBuilderResult.mappedValues`'ı (Gemini'nin GERÇEK field
 * key'leriyle döndürdüğü ham eşleme) alanların gerçek tiplerine göre
 * doğrulayıp güvenli bir sonuca çevirir. Şemayı hiç değiştirmiyor —
 * yalnızca "bunlar uygulanmaya hazır" listesini üretiyor.
 */
export function resolveGeneratorVisionMapping(
  fields: GeneratorField[],
  result: GeneratorBuilderResult,
): GeneratorVisionMappingResult {
  const values: Record<string, string | string[]> = {};
  const matchedFieldKeys: string[] = [];
  const raw = result.mappedValues ?? {};

  for (const field of fields) {
    const candidate = raw[field.key];
    if (candidate === undefined || candidate === null) continue;
    const coerced = coerceValueForField(field, candidate as string | string[]);
    if (coerced === null) continue;
    values[field.key] = coerced;
    matchedFieldKeys.push(field.key);
  }

  return { values, matchedFieldKeys };
}

const ALLOWED_SUGGESTED_TYPES: SuggestedGeneratorFieldType[] = ["text", "select", "multi_select", "color", "number"];

export interface CleanSuggestedField {
  label: string;
  type: SuggestedGeneratorFieldType;
  options: GeneratorFieldOption[];
}

function slugForCompare(label: string): string {
  return normalize(label);
}

/**
 * AI'nin önerdiği yeni alanları, gerçek generator şemasına eklenebilir
 * güvenli bir listeye sadeleştirir: geçersiz tipleri atar, zaten var olan
 * bir alanla (label bazlı, normalize edilmiş) çakışanları çıkarır, kendi
 * içinde yinelenenleri tekilleştirir, en fazla 6 öneriyle sınırlar.
 */
export function sanitizeSuggestedFields(
  suggested: SuggestedGeneratorField[] | undefined,
  existingFields: GeneratorField[],
): CleanSuggestedField[] {
  if (!Array.isArray(suggested)) return [];
  const existingLabels = new Set(existingFields.map((f) => slugForCompare(f.label)));
  const seen = new Set<string>();
  const clean: CleanSuggestedField[] = [];

  for (const item of suggested) {
    if (clean.length >= 6) break;
    const label = typeof item?.label === "string" ? item.label.trim() : "";
    if (!label) continue;
    const key = slugForCompare(label);
    if (!key || existingLabels.has(key) || seen.has(key)) continue;

    const type = ALLOWED_SUGGESTED_TYPES.includes(item.type) ? item.type : "text";
    const rawOptions = Array.isArray(item.options) ? item.options : [];
    const options: GeneratorFieldOption[] = rawOptions
      .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      .slice(0, 8)
      .map((o) => ({ label: o.trim(), value: slugForCompare(o) || o.trim() }));

    if ((type === "select" || type === "multi_select") && options.length === 0) continue;

    seen.add(key);
    clean.push({ label, type, options });
  }

  return clean;
}
