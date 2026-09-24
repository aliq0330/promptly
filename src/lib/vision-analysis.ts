/**
 * Görsel Analiz → Generator alanı eşleme motoru (AI Vision Generator
 * sistemi). Saf, DOM'suz fonksiyonlar — Gemini'nin `analyze-image` Edge
 * Function'ından dönen (deliberately loosely-typed, çünkü o fonksiyonun
 * kaynak kodu bu repoda yok ve `analysisPrompt`'un ürettiği tam JSON şekli
 * zaman içinde değişebilir) JSON'u, bir generator'ın GERÇEK, tamamen
 * creator-tanımlı `GeneratorSchema`'sına eşliyor.
 *
 * Mimari — neden paralel bir "AI şema" değil, genel bir eşleyici:
 * Bu uygulamada platform-seviyesinde sabit bir Generator alan seti YOK
 * (`GeneratorField.jsonPath`, Bölüm 9.28/9.30) — her generator kendi
 * alanlarını kendi tanımlıyor. Bu yüzden AI'nin döndürdüğü JSON'u sabit bir
 * "subject/style/character" şemasına göre değil, HERHANGİ bir generator'ın
 * HERHANGİ bir alan kümesine göre eşleyebilen genel bir motor gerekiyor:
 *
 *   AI JSON (nested, şekli önceden bilinmiyor)
 *     → flattenVisionResult (dot-path → değer)
 *     → her GeneratorField için: field.jsonPath / field.key / field.label
 *       normalize edilip AI path'leriyle karşılaştırılıyor
 *     → eşleşen değer, alanın tipine göre coerce ediliyor (select/radio/
 *       multi_select: yalnızca gerçek bir seçenekle eşleşirse yazılıyor —
 *       icat edilmiş bir seçenek asla yazılmıyor)
 *
 * Bu, §7'nin istediği "merkezi mapping layer, componentlere dağılmasın"
 * kuralını tek bir dosyada karşılıyor.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Gemini'den dönen, önceden bilinmeyen şekildeki analiz sonucu. Yalnızca `prompt`/`negative_prompt` özel olarak okunuyor (bkz. `readPromptSeed`), geri kalan her şey generic flatten+match ile işleniyor. */
export type VisionAnalysisData = Record<string, JsonValue>;

interface FlatEntry {
  path: string;
  segments: string[];
  value: string | string[];
}

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bir nesnenin "en anlamlı" tek metnini bulur (`{"garment":"dress"}` → "dress") — dizideki obje elemanlarını bir metin diziye indirger. */
function summarizeObject(obj: { [key: string]: JsonValue }): string | null {
  for (const key of ["label", "name", "type", "value", "description", "garment", "item", "color"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * AI'nin döndürdüğü (rastgele derinlikte iç içe) JSON'u dot-path → değer
 * çiftlerine düzleştirir. Boş string/boş dizi/null asla bir sonuç
 * üretmiyor — AI'nin "görülemeyen" için bıraktığı boş değerler (§5/§31'in
 * "belirsizse boş bırak" kuralının doğal sonucu) burada da hiçbir alanı
 * yanlışlıkla doldurmuyor.
 */
export function flattenVisionResult(value: JsonValue, path = "", out: FlatEntry[] = []): FlatEntry[] {
  if (value === null || value === undefined) return out;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) out.push({ path, segments: path.split("."), value: trimmed });
    return out;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    out.push({ path, segments: path.split("."), value: String(value) });
    return out;
  }

  if (Array.isArray(value)) {
    const strings: string[] = [];
    value.forEach((item, index) => {
      if (typeof item === "string") {
        if (item.trim()) strings.push(item.trim());
      } else if (typeof item === "number" || typeof item === "boolean") {
        strings.push(String(item));
      } else if (isPlainObject(item)) {
        flattenVisionResult(item, path ? `${path}.${index}` : String(index), out);
        const summary = summarizeObject(item);
        if (summary) strings.push(summary);
      }
    });
    if (strings.length > 0) out.push({ path, segments: path.split("."), value: strings });
    return out;
  }

  if (isPlainObject(value)) {
    for (const [key, v] of Object.entries(value)) {
      flattenVisionResult(v, path ? `${path}.${key}` : key, out);
    }
  }

  return out;
}

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

function splitIdentifier(text: string): string[] {
  return text.split(/[._\s-]+/).filter(Boolean);
}

/**
 * Bir generator alanının (`jsonPath`/`key`/`label`) AI'nin düzleştirilmiş
 * path'leriyle en iyi eşleşmesini bulur. Tam normalize eşleşme, sonra son
 * iki segment eşleşmesi, sonra (en az 3 karakterse) yalnızca son segment
 * eşleşmesi deneniyor — çok kısa/genel bir segment ("type" gibi) yanlış
 * pozitif üretmesin diye 3 karakter alt sınırı var.
 */
function findBestMatch(candidates: string[], flat: FlatEntry[]): FlatEntry | null {
  const candidateVariants = candidates
    .filter(Boolean)
    .map((c) => {
      const segs = splitIdentifier(c);
      return {
        full: normalize(segs.join("")),
        last2: normalize(segs.slice(-2).join("")),
        last1: normalize(segs.slice(-1).join("")),
      };
    });

  for (const variant of candidateVariants) {
    for (const entry of flat) {
      const full = normalize(entry.segments.join(""));
      if (variant.full && variant.full === full) return entry;
    }
  }
  for (const variant of candidateVariants) {
    for (const entry of flat) {
      const last2 = normalize(entry.segments.slice(-2).join(""));
      if (variant.last2 && variant.last2 === last2) return entry;
    }
  }
  for (const variant of candidateVariants) {
    if (variant.last1.length < 3) continue;
    for (const entry of flat) {
      const last1 = normalize(entry.segments.slice(-1).join(""));
      if (variant.last1 === last1) return entry;
    }
  }
  return null;
}

/**
 * Bu proje her yerde Türkçe etiketli, Türkçe-slug değerli `select`
 * seçenekleri kullanıyor (`generator-field-catalog.ts` → `opts()`), ama
 * Gemini Vision sonuçları genelde İngilizce dönüyor ("brown", "male").
 * Tam bir çeviri sistemi kapsam dışı — yalnızca portre/karakter
 * analizinde en sık geçen, somut terimler için küçük bir TR-EN köprüsü.
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

export interface GeneratorFieldLike {
  key: string;
  label: string;
  jsonPath: string;
  type: string;
  options: { label: string; value: string }[];
  min: number | null;
  max: number | null;
}

export interface GeneratorSchemaLike {
  fields: GeneratorFieldLike[];
}

/** `field.jsonPath` boşsa `field.key`'e düşer — `generator-output.ts`'in kendi kuralıyla birebir aynı. */
function fieldPath(field: GeneratorFieldLike): string {
  return field.jsonPath?.trim() || field.key;
}

/**
 * Bir alanın eşleşen ham AI değerini, alanın GERÇEK tipine göre güvenli bir
 * runtime değerine çevirir. `select`/`radio`/`multi_select` yalnızca
 * gerçekten var olan bir seçenekle eşleşirse dolduruluyor — icat edilmiş
 * bir seçenek asla `GeneratorValues`'a yazılmıyor (§29 standardizasyon +
 * §31 "uydurma" yasağının frontend tarafındaki karşılığı).
 */
function coerceForField(field: GeneratorFieldLike, raw: string | string[]): string | string[] | null {
  const rawList = Array.isArray(raw) ? raw : [raw];
  const rawJoined = rawList.join(", ");

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
      // bilinçli olarak eşlenmiyor (§9: kullanıcı zaten istediği gibi
      // ayarlayabiliyor).
      return null;
    default:
      return rawJoined.length > 0 ? rawJoined : null;
  }
}

export interface VisionMappingResult {
  values: Record<string, string | string[]>;
  matchedFieldKeys: string[];
}

/**
 * §7'nin merkezi eşleme fonksiyonu — verilen şema için AI sonucunu
 * `GeneratorValues`'a çevirir. Eşleşmeyen alanlara HİÇ dokunulmuyor
 * (çağıran taraf bunları mevcut değerlerin üzerine `{...prev, ...values}`
 * ile birleştirebilir, hiçbir şeyi sessizce sıfırlamaz).
 */
export function mapVisionResultToFieldValues(
  schema: GeneratorSchemaLike,
  result: VisionAnalysisData,
): VisionMappingResult {
  const flat = flattenVisionResult(result as JsonValue);
  const values: Record<string, string | string[]> = {};
  const matchedFieldKeys: string[] = [];

  for (const field of schema.fields) {
    const match = findBestMatch([fieldPath(field), field.key, field.label], flat);
    if (!match) continue;
    const coerced = coerceForField(field, match.value);
    if (coerced === null) continue;
    values[field.key] = coerced;
    matchedFieldKeys.push(field.key);
  }

  return { values, matchedFieldKeys };
}

/** AI'nin ürettiği (varsa) `prompt` metnini okur — yalnızca runtime formun "Prompt" kutusunu DOLDURMAK için bir başlangıç değeri (§20: mevcut prompt builder'ın üzerine yazmıyor, onun girdisi oluyor). */
export function readPromptSeed(result: VisionAnalysisData): string {
  const value = result.prompt;
  return typeof value === "string" ? value.trim() : "";
}

/** AI'nin ürettiği (varsa) `negative_prompt`'u okur — dizi veya string olabilir, ikisini de düz bir metne çevirir. */
export function readNegativePromptSeed(result: VisionAnalysisData): string {
  const value = result.negative_prompt;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(", ");
  }
  return "";
}
