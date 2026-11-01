/**
 * Promptly değişim biçimi (v1) — bir Prompt'un dosyaya yazılan ve dosyadan okunan HÂLİ. JSON / CSV / Markdown
 * dönüştürücüleri (json.ts, csv.ts, markdown.ts) bu tek modeli paylaşır; doğrulama kuralları da burada, tek yerde.
 *
 * Bilerek DIŞARIDA bırakılanlar: yazar, durum, görünürlük, sayaçlar, topluluk, köken, medya. İçe aktarılan içerik
 * her zaman çağıranın kendi özel taslağı olur; bu alanlar dosyada bulunsa bile yok sayılır (`import_prompts` RPC'si
 * de aynısını yapar — istemci tek koruma değildir).
 *
 * Hiçbir import yok: Node'da doğrudan test edilebilir.
 */

export const EXCHANGE_SCHEMA_VERSION = 1;
/** JSON zarfındaki `format` alanı. */
export const EXCHANGE_JSON_FORMAT = "promptly.prompts";

export type ExchangeFormat = "json" | "csv" | "markdown";
export type ExchangeContentType = "image" | "text" | "audio" | "video";

export const EXCHANGE_CONTENT_TYPES: readonly ExchangeContentType[] = ["image", "text", "audio", "video"];
export const EXCHANGE_VARIABLE_TYPES = ["text", "select", "multi_select", "number", "slider", "toggle"] as const;
export type ExchangeVariableType = (typeof EXCHANGE_VARIABLE_TYPES)[number];

/** Sınırlar `import_prompts` RPC'si ve prompts tablosundaki CHECK'lerle aynıdır (başlık 200, açıklama 5000, metin 50000, ≤3 araç). */
export const EXCHANGE_LIMITS = {
  title: 200,
  description: 5000,
  promptText: 50000,
  tags: 20,
  tagLabel: 60,
  tools: 3,
  variables: 30,
  variableName: 40,
  variableDescription: 500,
  variableOptions: 50,
  /** Tek içe aktarmadaki en çok prompt (saatlik prompt hız sınırıyla — 30 — uyumlu). */
  items: 30,
  /** Seçilen dosyanın en büyük boyutu (bayt). */
  fileBytes: 2_000_000,
  /** Kaynak/atıf alanları (`source`). */
  sourceCredit: 300,
  sourceUrl: 500,
} as const;

/** Moderatör toplu yüklemesi (docs/history/251-*): toplam adet sınırı YOK; yalnız tek RPC çağrısına konan adet ve dosya boyutu sınırlıdır. */
export const ADMIN_IMPORT_LIMITS = {
  /** Tek `admin_import_prompts` çağrısındaki en çok prompt (deyim zaman aşımına karşı; dosya bu boyda parçalanarak yüklenir). */
  batch: 50,
  /** Seçilen / getirilen dosyanın en büyük boyutu (bayt). */
  fileBytes: 25_000_000,
} as const;

export interface ExchangeVariableOption {
  label: string;
  value: string;
  color?: string;
}

export interface ExchangeVariable {
  name: string;
  defaultValue: string;
  description: string | null;
  type: ExchangeVariableType;
  options: ExchangeVariableOption[];
  config: Record<string, unknown>;
}

/** Promptun nereden geldiği (isteğe bağlı): içe aktarırken açıklamanın sonuna "Kaynak: …" satırı olarak yazılır (`withSourceNote`). */
export interface ExchangeSource {
  /** Okunur atıf metni: "@kullanici · Promptly", "prompts.chat (CC0) — @katkıcı". */
  credit: string | null;
  /** Yalnız http(s) adresi. */
  url: string | null;
}

export interface ExchangePrompt {
  title: string;
  description: string;
  promptText: string;
  contentType: ExchangeContentType;
  category: string | null;
  subcategory: string | null;
  /** Katalog araç başvuruları: "toolId" ya da "toolId:modelId". */
  tools: string[];
  /** Etiket ETİKETLERİ (slug değil); içe aktarmada `get_or_create_tag` slug'ı üretir. */
  tags: string[];
  /** Yalnızca JSON taşır; Markdown ve CSV'de değişkenler metindeki `{ad}` jetonlarıyla kalır. */
  variables: ExchangeVariable[];
  /** Yalnızca varsa bulunur (başkasının promptu dışa aktarılınca ya da toplu kaynaktan gelince). */
  source?: ExchangeSource;
}

export type ExchangeIssueCode =
  | "required"
  | "too_long"
  | "invalid_content_type"
  | "invalid_tag"
  | "too_many_tags"
  | "invalid_tool"
  | "too_many_tools"
  | "invalid_variable"
  | "too_many_variables"
  | "invalid_row"
  | "invalid_selection"
  | "missing_frontmatter";

/** Tek bir satır/prompt sorunu. `row` 1'den başlar (kullanıcının dosyada gördüğü sıra). */
export interface ExchangeIssue {
  row: number;
  field: string;
  code: ExchangeIssueCode;
}

export type ExchangeFatalCode =
  | "empty"
  | "too_large"
  | "invalid_json"
  | "invalid_csv"
  | "unsupported_version"
  | "unknown_format"
  | "missing_columns"
  | "too_many_items"
  | "markdown_separator";

export interface ParseResult {
  /** Yalnızca doğrulamadan geçenler. */
  items: ExchangePrompt[];
  issues: ExchangeIssue[];
  /** Dosya bütünüyle okunamadıysa (kalan alanlar boş). */
  fatal: ExchangeFatalCode | null;
  /** Dosyadaki toplam satır/prompt sayısı (geçersizler dahil). */
  total: number;
}

export class ExchangeError extends Error {
  code: ExchangeFatalCode;
  constructor(code: ExchangeFatalCode) {
    super(code);
    this.name = "ExchangeError";
    this.code = code;
  }
}

export function fatalResult(fatal: ExchangeFatalCode): ParseResult {
  return { items: [], issues: [], fatal, total: 0 };
}

export const TOOL_REF_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,59}(:[A-Za-z0-9][A-Za-z0-9_.-]{0,59})?$/;
const VARIABLE_NAME_PATTERN = /^[^{}\s]{1,40}$/u;
// Etiket adı veritabanında da `[<>]` ve kontrol karakterlerini reddeder (get_or_create_tag).
export const BAD_TAG_PATTERN = /[<>\u0000-\u001f\u007f]/u;

export function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

export function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => str(entry).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[\r\n]+/).map((entry) => entry.trim()).filter(Boolean);
  return [];
}

export function dedupe(values: string[], caseInsensitive: boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = caseInsensitive ? value.toLocaleLowerCase("tr") : value;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function nullableSlug(value: unknown): string | null {
  const text = str(value).trim();
  return text === "" ? null : text;
}

function normalizeVariableEntry(raw: unknown): ExchangeVariable | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const name = str(entry.name).trim();
  if (!VARIABLE_NAME_PATTERN.test(name)) return null;
  const type = str(entry.type || "text") as ExchangeVariableType;
  if (!EXCHANGE_VARIABLE_TYPES.includes(type)) return null;
  const description = str(entry.description).trim();
  if (description.length > EXCHANGE_LIMITS.variableDescription) return null;

  const options: ExchangeVariableOption[] = [];
  if (Array.isArray(entry.options)) {
    for (const option of entry.options) {
      if (!option || typeof option !== "object") return null;
      const o = option as Record<string, unknown>;
      const label = str(o.label).trim();
      const value = str(o.value).trim();
      if (!label || !value) return null;
      const color = str(o.color).trim();
      options.push(color ? { label, value, color } : { label, value });
    }
  }
  if (options.length > EXCHANGE_LIMITS.variableOptions) return null;
  const isChoice = type === "select" || type === "multi_select";
  if (isChoice && options.length < 2) return null;

  const config =
    entry.config && typeof entry.config === "object" && !Array.isArray(entry.config) ? { ...(entry.config as Record<string, unknown>) } : {};
  return { name, defaultValue: str(entry.defaultValue), description: description || null, type, options: isChoice ? options : [], config };
}

/**
 * Atıf alanı: JSON'da `source: {credit, url}`, Markdown/CSV'de düz `sourceCredit`/`sourceUrl` (ya da `source_credit`/`source_url`).
 * Yalnızca bilgi amaçlıdır; geçersiz/uzun değer sessizce atılır (içeriği reddettirmez). Adres yalnız http(s) olabilir.
 */
function normalizeSource(r: Record<string, unknown>): ExchangeSource | null {
  const nested = r.source && typeof r.source === "object" && !Array.isArray(r.source) ? (r.source as Record<string, unknown>) : {};
  const credit = str(nested.credit ?? r.sourceCredit ?? r.source_credit).replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const rawUrl = str(nested.url ?? r.sourceUrl ?? r.source_url).trim();
  const url = /^https?:\/\/[^\s<>"']+$/i.test(rawUrl) && rawUrl.length <= EXCHANGE_LIMITS.sourceUrl ? rawUrl : null;
  const text = credit.length > 0 && credit.length <= EXCHANGE_LIMITS.sourceCredit ? credit : null;
  return text || url ? { credit: text, url } : null;
}

/** Açıklamada zaten bir "Kaynak:/Source:" satırı varsa (`source-notes.ts` biçimi) tekrar eklenmez. */
const HAS_SOURCE_LINE = /^\s*(kaynak|source)\s*:/im;

/**
 * İçe aktarmadan hemen önce çağrılır: `source` varsa açıklamanın sonuna `Kaynak: <atıf> <adres>` satırı ekler (detay sayfası bu satırı
 * "kaynak notu" olarak gösterir, adresi bağlantıya çevirir). Zaten bir kaynak satırı varsa dokunmaz; 5000 karakter sınırı aşılırsa açıklama kısaltılır.
 */
export function withSourceNote(item: ExchangePrompt): ExchangePrompt {
  const { source } = item;
  if (!source || HAS_SOURCE_LINE.test(item.description)) return item;
  const note = `Kaynak: ${[source.credit, source.url].filter(Boolean).join(" ")}`.trim();
  const room = EXCHANGE_LIMITS.description - note.length - 2;
  const body = item.description.length > room ? `${item.description.slice(0, Math.max(0, room - 1)).trimEnd()}…` : item.description;
  return { ...item, description: body ? `${body}\n\n${note}` : note };
}

/**
 * Ham bir kaydı (JSON nesnesi, CSV satırı, Markdown belgesi) doğrular ve temizler. Bilinmeyen alanlar atılır.
 * Geçersizse `item` null döner ve en az bir sorun bildirilir.
 */
export function normalizePrompt(raw: unknown, row: number): { item: ExchangePrompt | null; issues: ExchangeIssue[] } {
  const issues: ExchangeIssue[] = [];
  const report = (field: string, code: ExchangeIssueCode) => issues.push({ row, field, code });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    report("", "invalid_row");
    return { item: null, issues };
  }
  const r = raw as Record<string, unknown>;

  const title = str(r.title).trim();
  if (!title) report("title", "required");
  else if (title.length > EXCHANGE_LIMITS.title) report("title", "too_long");

  const description = str(r.description).trim();
  if (description.length > EXCHANGE_LIMITS.description) report("description", "too_long");

  const promptText = str(r.promptText ?? r.prompt_text).trim();
  if (!promptText) report("promptText", "required");
  else if (promptText.length > EXCHANGE_LIMITS.promptText) report("promptText", "too_long");

  const contentType = str(r.contentType ?? r.content_type).trim().toLowerCase() as ExchangeContentType;
  if (!EXCHANGE_CONTENT_TYPES.includes(contentType)) report("contentType", "invalid_content_type");

  const tools = dedupe(strList(r.tools), false);
  if (tools.length > EXCHANGE_LIMITS.tools) report("tools", "too_many_tools");
  else if (tools.some((ref) => !TOOL_REF_PATTERN.test(ref))) report("tools", "invalid_tool");

  const tags = dedupe(strList(r.tags), true);
  if (tags.length > EXCHANGE_LIMITS.tags) report("tags", "too_many_tags");
  else if (tags.some((tag) => tag.length > EXCHANGE_LIMITS.tagLabel || BAD_TAG_PATTERN.test(tag))) report("tags", "invalid_tag");

  const variables: ExchangeVariable[] = [];
  if (r.variables !== undefined && r.variables !== null) {
    if (!Array.isArray(r.variables)) report("variables", "invalid_variable");
    else if (r.variables.length > EXCHANGE_LIMITS.variables) report("variables", "too_many_variables");
    else {
      const names = new Set<string>();
      for (const entry of r.variables) {
        const variable = normalizeVariableEntry(entry);
        if (!variable || names.has(variable.name)) {
          report("variables", "invalid_variable");
          break;
        }
        names.add(variable.name);
        variables.push(variable);
      }
    }
  }

  const source = normalizeSource(r);

  if (issues.length > 0) return { item: null, issues };
  return {
    item: {
      title,
      description,
      promptText,
      contentType,
      category: nullableSlug(r.category),
      subcategory: nullableSlug(r.subcategory),
      tools,
      tags,
      variables,
      ...(source ? { source } : {}),
    },
    issues,
  };
}

/** Birden çok ham kaydı doğrular; geçerliler `items`'a, sorunlar `issues`'a gider. Satır sayısı sınırı aşılırsa fatal. */
export function normalizeAll(rows: unknown[], maxItems: number = EXCHANGE_LIMITS.items): ParseResult {
  if (rows.length === 0) return fatalResult("empty");
  if (rows.length > maxItems) return { ...fatalResult("too_many_items"), total: rows.length };
  const items: ExchangePrompt[] = [];
  const issues: ExchangeIssue[] = [];
  rows.forEach((raw, index) => {
    const result = normalizePrompt(raw, index + 1);
    if (result.item) items.push(result.item);
    issues.push(...result.issues);
  });
  return { items, issues, fatal: null, total: rows.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// Uygulama tiplerinden dışa aktarma
// ---------------------------------------------------------------------------------------------------------------------

/** `Prompt`'un dışa aktarmak için gereken parçası (yapısal tip: bu dosya uygulama tiplerini import etmez). */
export interface ExchangeAppPrompt {
  title: string;
  description: string;
  promptText: string;
  contentType: string;
  category?: string | null;
  subcategory?: string | null;
  tools?: string[] | null;
  tags: { label: string }[];
}

export interface ExchangeVariableSource {
  name: string;
  defaultValue: string;
  description: string | null;
  type: string;
  options: { label: string; value: string; color?: string }[];
  config: object;
}

export function toExchangePrompt(source: ExchangeAppPrompt, variables: ExchangeVariableSource[] = [], credit?: ExchangeSource | null): ExchangePrompt {
  return {
    title: source.title,
    description: source.description,
    promptText: source.promptText,
    contentType: (EXCHANGE_CONTENT_TYPES as readonly string[]).includes(source.contentType) ? (source.contentType as ExchangeContentType) : "text",
    category: source.category ?? null,
    subcategory: source.subcategory ?? null,
    tools: [...(source.tools ?? [])],
    tags: source.tags.map((tag) => tag.label),
    variables: variables.map((variable) => ({
      name: variable.name,
      defaultValue: variable.defaultValue,
      description: variable.description,
      type: variable.type as ExchangeVariableType,
      // Seçenek görselleri (data URL) yalnız arayüz içindir ve büyüktür; dosyaya yazılmaz.
      options: variable.options.map((option) => (option.color ? { label: option.label, value: option.value, color: option.color } : { label: option.label, value: option.value })),
      config: { ...variable.config },
    })),
    ...(credit && (credit.credit || credit.url) ? { source: credit } : {}),
  };
}
