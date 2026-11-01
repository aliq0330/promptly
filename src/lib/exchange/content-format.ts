/**
 * İstek ve Hazır ayar için dışa/içe aktarma biçimi (docs/history/306-*). Prompt biçimiyle (prompt-format.ts) AYNI ilkeler ve AYNI zarf:
 * sürüm numaralı JSON zarfı, saf/bağımlılıksız doğrulama, dosyadan yalnızca içerik alınır — yazar, durum, görünürlük, sayaç, topluluk,
 * medya ASLA (içe aktarılan her şey çağıranın özel taslağıdır, `import_content` RPC'si de aynısını yapar; istemci tek koruma değildir).
 *
 * Yalnız JSON: bu iki türün alanları yapılıdır (Hazır ayar seçimi bir nesnedir), Markdown/CSV'ye sığmaz.
 * Hazır ayarın KENDİ eklediği alanları (`preset_fields`) dosyaya yazılmaz: kimlikleri başka hesapta anlamsızdır; yalnız platform alanları taşınır.
 */
import {
  BAD_TAG_PATTERN,
  EXCHANGE_CONTENT_TYPES,
  EXCHANGE_JSON_FORMAT,
  EXCHANGE_LIMITS,
  EXCHANGE_SCHEMA_VERSION,
  TOOL_REF_PATTERN,
  dedupe,
  nullableSlug,
  str,
  strList,
  type ExchangeContentType,
  type ExchangeFatalCode,
  type ExchangeIssue,
  type ExchangeIssueCode,
} from "./prompt-format.ts";

export type ExchangeContentKind = "request" | "preset";

/** JSON zarfındaki `format` değeri (prompt için `EXCHANGE_JSON_FORMAT` = "promptly.prompts"). */
export const CONTENT_JSON_FORMAT: Record<ExchangeContentKind, string> = {
  request: "promptly.requests",
  preset: "promptly.presets",
};

/** Sınırlar `import_content` RPC'si ve tablo CHECK'leriyle aynıdır. */
export const CONTENT_LIMITS = {
  request: { title: 200, description: 5000, direction: 5000 },
  preset: { title: 120, description: 1000, selectionChars: 20000 },
} as const;

export type ExchangeSelectionValue = string | number | boolean | (string | number | boolean)[];

export interface ExchangeRequest {
  title: string;
  description: string;
  creativeDirection: string;
  contentType: ExchangeContentType;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  tags: string[];
}

export interface ExchangePreset {
  title: string;
  description: string;
  contentType: ExchangeContentType;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  tags: string[];
  /** `{ alanId: değer }` — yalnız düz değerler (metin, sayı, evet/hayır, bunların listesi). */
  selection: Record<string, ExchangeSelectionValue>;
}

export type ExchangeContentItem<K extends ExchangeContentKind> = K extends "request" ? ExchangeRequest : ExchangePreset;

export interface ContentParseResult<K extends ExchangeContentKind> {
  items: ExchangeContentItem<K>[];
  issues: ExchangeIssue[];
  fatal: ExchangeFatalCode | null;
  total: number;
}

function fatal<K extends ExchangeContentKind>(code: ExchangeFatalCode): ContentParseResult<K> {
  return { items: [], issues: [], fatal: code, total: 0 };
}

function isFlat(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** Ortak alanlar (tür, kategori, araç, etiket): `normalizePrompt` ile aynı kurallar. */
function normalizeCommon(r: Record<string, unknown>, report: (field: string, code: ExchangeIssueCode) => void) {
  const contentType = str(r.contentType ?? r.content_type).trim().toLowerCase() as ExchangeContentType;
  if (!EXCHANGE_CONTENT_TYPES.includes(contentType)) report("contentType", "invalid_content_type");

  const tools = dedupe(strList(r.tools), false);
  if (tools.length > EXCHANGE_LIMITS.tools) report("tools", "too_many_tools");
  else if (tools.some((ref) => !TOOL_REF_PATTERN.test(ref))) report("tools", "invalid_tool");

  const tags = dedupe(strList(r.tags), true);
  if (tags.length > EXCHANGE_LIMITS.tags) report("tags", "too_many_tags");
  else if (tags.some((tag) => tag.length > EXCHANGE_LIMITS.tagLabel || BAD_TAG_PATTERN.test(tag))) report("tags", "invalid_tag");

  return { contentType, tools, tags, category: nullableSlug(r.category), subcategory: nullableSlug(r.subcategory) };
}

export function normalizeRequest(raw: unknown, row: number): { item: ExchangeRequest | null; issues: ExchangeIssue[] } {
  const issues: ExchangeIssue[] = [];
  const report = (field: string, code: ExchangeIssueCode) => issues.push({ row, field, code });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    report("", "invalid_row");
    return { item: null, issues };
  }
  const r = raw as Record<string, unknown>;
  const limits = CONTENT_LIMITS.request;

  const title = str(r.title).trim();
  if (!title) report("title", "required");
  else if (title.length > limits.title) report("title", "too_long");

  const description = str(r.description).trim();
  if (!description) report("description", "required");
  else if (description.length > limits.description) report("description", "too_long");

  const creativeDirection = str(r.creativeDirection ?? r.creative_direction).trim();
  if (creativeDirection.length > limits.direction) report("creativeDirection", "too_long");

  const common = normalizeCommon(r, report);
  if (issues.length > 0) return { item: null, issues };
  return { item: { title, description, creativeDirection, ...common }, issues };
}

export function normalizePreset(raw: unknown, row: number): { item: ExchangePreset | null; issues: ExchangeIssue[] } {
  const issues: ExchangeIssue[] = [];
  const report = (field: string, code: ExchangeIssueCode) => issues.push({ row, field, code });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    report("", "invalid_row");
    return { item: null, issues };
  }
  const r = raw as Record<string, unknown>;
  const limits = CONTENT_LIMITS.preset;

  const title = str(r.title).trim();
  if (!title) report("title", "required");
  else if (title.length > limits.title) report("title", "too_long");

  const description = str(r.description).trim();
  if (description.length > limits.description) report("description", "too_long");

  const selection: Record<string, ExchangeSelectionValue> = {};
  const rawSelection = r.selection;
  if (!rawSelection || typeof rawSelection !== "object" || Array.isArray(rawSelection)) report("selection", "invalid_selection");
  else {
    for (const [key, value] of Object.entries(rawSelection as Record<string, unknown>)) {
      if (isFlat(value) || (Array.isArray(value) && value.every(isFlat))) selection[key] = value;
      else {
        report("selection", "invalid_selection");
        break;
      }
    }
    if (JSON.stringify(selection).length > limits.selectionChars) report("selection", "too_long");
  }

  const common = normalizeCommon(r, report);
  if (issues.length > 0) return { item: null, issues };
  return { item: { title, description, selection, ...common }, issues };
}

/** Sürüm numaralı zarf: `{ format, schemaVersion, exportedAt, items }`. */
export function serializeContent<K extends ExchangeContentKind>(kind: K, items: ExchangeContentItem<K>[], exportedAt: string = new Date().toISOString()): string {
  return `${JSON.stringify({ format: CONTENT_JSON_FORMAT[kind], schemaVersion: EXCHANGE_SCHEMA_VERSION, exportedAt, items }, null, 2)}\n`;
}

/**
 * Zarf, çıplak dizi ya da tek nesne kabul eder. Başka bir türün zarfı (ör. prompt dosyası) ve gelecekteki `schemaVersion` sessizce
 * okunmaz, reddedilir.
 */
export function parseContent<K extends ExchangeContentKind>(kind: K, text: string, maxItems: number = EXCHANGE_LIMITS.items): ContentParseResult<K> {
  if (text.trim() === "") return fatal("empty");
  if (text.length > EXCHANGE_LIMITS.fileBytes) return fatal("too_large");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fatal("invalid_json");
  }
  let rows: unknown[];
  if (Array.isArray(data)) rows = data;
  else if (data && typeof data === "object") {
    const envelope = data as Record<string, unknown>;
    if (Array.isArray(envelope.items)) {
      if (typeof envelope.schemaVersion === "number" && envelope.schemaVersion > EXCHANGE_SCHEMA_VERSION) return fatal("unsupported_version");
      if (envelope.format !== undefined && envelope.format !== CONTENT_JSON_FORMAT[kind]) return fatal("unknown_format");
      rows = envelope.items;
    } else rows = [data];
  } else return fatal("invalid_json");

  if (rows.length === 0) return fatal("empty");
  if (rows.length > maxItems) return { ...fatal<K>("too_many_items"), total: rows.length };
  const items: ExchangeContentItem<K>[] = [];
  const issues: ExchangeIssue[] = [];
  rows.forEach((raw, index) => {
    const result = kind === "request" ? normalizeRequest(raw, index + 1) : normalizePreset(raw, index + 1);
    if (result.item) items.push(result.item as ExchangeContentItem<K>);
    issues.push(...result.issues);
  });
  return { items, issues, fatal: null, total: rows.length };
}

/** `promptly-requests-2026-11-01.json` / `promptly-presets-…`. */
export function contentFileName(kind: ExchangeContentKind, date: Date = new Date()): string {
  return `promptly-${kind === "request" ? "requests" : "presets"}-${date.toISOString().slice(0, 10)}.json`;
}

/** Uygulama tiplerinden dışa aktarma (yapısal tipler: bu dosya uygulama tiplerini import etmez). */
export interface ExchangeAppRequest {
  title: string;
  description: string;
  creativeDirection: string;
  contentType?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tools?: string[] | null;
  tags: { label: string }[];
}

export function toExchangeRequest(source: ExchangeAppRequest): ExchangeRequest {
  return {
    title: source.title,
    description: source.description,
    creativeDirection: source.creativeDirection ?? "",
    contentType: (EXCHANGE_CONTENT_TYPES as readonly string[]).includes(source.contentType ?? "") ? (source.contentType as ExchangeContentType) : "image",
    category: source.category ?? null,
    subcategory: source.subcategory ?? null,
    tools: [...(source.tools ?? [])],
    tags: source.tags.map((tag) => tag.label),
  };
}

export interface ExchangeAppPreset {
  title: string;
  description: string;
  contentType: string;
  category?: string | null;
  subcategory?: string | null;
  tools?: string[] | null;
  tags: { label: string }[];
  selection: Record<string, unknown>;
  /** Kullanıcının kendi eklediği alanlar: kimlikleri dosyaya yazılmaz (`selection` anahtarlarından da çıkarılır). */
  fields?: { id: string }[];
}

export function toExchangePreset(source: ExchangeAppPreset): ExchangePreset {
  const custom = new Set((source.fields ?? []).map((field) => field.id));
  const selection: Record<string, ExchangeSelectionValue> = {};
  for (const [key, value] of Object.entries(source.selection ?? {})) {
    if (custom.has(key)) continue;
    if (isFlat(value) || (Array.isArray(value) && value.every(isFlat))) selection[key] = value;
  }
  return {
    title: source.title,
    description: source.description,
    contentType: (EXCHANGE_CONTENT_TYPES as readonly string[]).includes(source.contentType) ? (source.contentType as ExchangeContentType) : "image",
    category: source.category ?? null,
    subcategory: source.subcategory ?? null,
    tools: [...(source.tools ?? [])],
    tags: source.tags.map((tag) => tag.label),
    selection,
  };
}

/** Prompt zarfının adı, yanlış dosyayı seçince daha iyi hata verebilmek için dışarıdan okunabilir. */
export { EXCHANGE_JSON_FORMAT };
