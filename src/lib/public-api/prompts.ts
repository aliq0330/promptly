/**
 * Promptly açık API çekirdeği — herkese açık promptları arama, okuma ve doldurma. MCP sunucusu (`mcp/`) ve Edge Function `api`
 * (`supabase/functions/api`) AYNI fonksiyonları çağırır; yeni bir açık okuma yüzeyi buraya eklenir, ikinci bir sorgu yazılmaz.
 *
 * Kurallar (CLAUDE.md §6, `docs/history/297-*`):
 * - Yalnız yayında + herkese açık + topluluğa ait olmayan + silinmemiş prompt (`community_id is null` AÇIKÇA süzülür; RLS de anon'a
 *   yalnız herkese açık olanı verir — süzgeç niyeti belgeler, yetkiyi genişletmez).
 * - Dışa verilen prompt biçimi değişim çekirdeğidir (`toExchangePrompt`), ikinci bir biçim yok; başkasının promptu olduğu için her
 *   kayıt atıf (`source`: yazar + bağlantı, uuid yok) taşır — sitedeki "Dışa aktar" ile aynı.
 * - Her liste sınırlıdır (`limit` ≤ 50); PostgREST'in 1000 satır kesmesine güvenen sorgu yok.
 */
import { toExchangePrompt, type ExchangeContentType, type ExchangePrompt, type ExchangeVariable } from "../exchange/prompt-format.ts";
import { extractVariableTokenNames, resolvePromptText } from "../prompt-variables.ts";
import { sharePathFor } from "../share-link.ts";
import { normalizeTagLabel } from "../tag-normalize.ts";
import { PublicApiError, type RestClient } from "./rest.ts";

export type PublicSort = "relevant" | "new" | "popular";
export type PopularPeriod = "week" | "month" | "year" | "all";
export type PopularBy = "copies" | "likes";

export const PUBLIC_SORTS: readonly PublicSort[] = ["relevant", "new", "popular"];
export const POPULAR_PERIODS: readonly PopularPeriod[] = ["week", "month", "year", "all"];
export const POPULAR_BY: readonly PopularBy[] = ["copies", "likes"];
export const CONTENT_TYPES: readonly ExchangeContentType[] = ["image", "text", "audio", "video"];
export const PUBLIC_LIMITS = { defaultLimit: 20, maxLimit: 50, query: 80, previewChars: 280, descriptionChars: 300, filterItems: 10 } as const;

export interface PublicAuthor {
  username: string;
  displayName: string | null;
}

export interface PublicStats {
  likes: number;
  saves: number;
  comments: number;
  copies: number;
}

/** Liste satırı: tam metin yok (bağlamı şişirmesin), değişken ADLARI metindeki `{ad}` jetonlarından. Tam hâli `getPrompt`. */
export interface PublicPromptSummary {
  id: string;
  url: string;
  title: string;
  description: string;
  promptPreview: string;
  contentType: ExchangeContentType;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  tags: string[];
  variableNames: string[];
  author: PublicAuthor;
  stats: PublicStats;
  createdAt: string;
}

/** Tam prompt = değişim biçimi (`ExchangePrompt`, `source` dolu) + kimlik/bağlantı/yazar/sayaç. */
export interface PublicPrompt extends ExchangePrompt {
  id: string;
  url: string;
  author: PublicAuthor;
  stats: PublicStats;
  createdAt: string;
}

export interface SearchParams {
  query?: string | null;
  contentType?: string | null;
  category?: string | null;
  subcategory?: string | null;
  /** Etiket slug'ları — HEPSİ gerekir (sitedeki arama kuralı). */
  tags?: string[] | null;
  /** Araç başvuruları (`midjourney` / `midjourney:v7`) — biri yeter. */
  tools?: string[] | null;
  sort?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface Page<T> {
  items: T[];
  /** Sonraki sayfa için opak imleç; yoksa liste bitti. */
  nextCursor: string | null;
}

export interface PopularParams {
  period?: string | null;
  by?: string | null;
  contentType?: string | null;
  limit?: number | null;
}

export interface FillResult {
  text: string;
  /** Kullanılan değerler (verilen ya da varsayılan). */
  values: Record<string, string>;
  /** Metinde geçen ama ne değeri ne varsayılanı olan değişkenler — metinde `{ad}` olarak kalır. */
  missing: string[];
  /** Verilen ama metinde geçmeyen anahtarlar (yazım hatası olabilir). */
  unknown: string[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Satır → nesne
// ---------------------------------------------------------------------------------------------------------------------

interface PromptRow {
  id: string;
  title: string;
  description: string | null;
  prompt_text: string;
  content_type: string | null;
  category: string | null;
  subcategory: string | null;
  tool: string | null;
  tools: string[] | null;
  like_count: number | null;
  save_count: number | null;
  comment_count: number | null;
  copy_count: number | null;
  created_at: string;
  profiles: { username: string; display_name: string | null } | null;
  prompt_tags: { tags: { slug: string; label: string } | null }[] | null;
}

interface VariableRow {
  prompt_id: string;
  name: string;
  default_value: string | null;
  description: string | null;
  type: string | null;
  options: unknown;
  config: unknown;
}

const PROMPT_COLUMNS =
  "id,title,description,prompt_text,content_type,category,subcategory,tool,tools,like_count,save_count,comment_count,copy_count,created_at," +
  "profiles:author_id(username,display_name),prompt_tags(tags(slug,label))";
const VARIABLE_COLUMNS = "prompt_id,name,default_value,description,type,options,config,sort_order";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const TOOL_REF_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,59}(:[A-Za-z0-9][A-Za-z0-9_.-]{0,59})?$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function publicFilters(params: URLSearchParams): URLSearchParams {
  params.set("status", "eq.published");
  params.set("visibility", "eq.public");
  params.set("community_id", "is.null");
  params.set("deleted_at", "is.null");
  return params;
}

export function promptUrl(siteUrl: string, id: string): string {
  return `${siteUrl}${sharePathFor("prompt", id)}`;
}

function toolsOf(row: PromptRow): string[] {
  const list = (row.tools ?? []).filter((ref) => typeof ref === "string" && ref.trim() !== "");
  return list.length > 0 ? list : row.tool ? [row.tool] : [];
}

function authorOf(row: PromptRow): PublicAuthor {
  return { username: row.profiles?.username ?? "unknown", displayName: row.profiles?.display_name ?? null };
}

function statsOf(row: PromptRow): PublicStats {
  return { likes: row.like_count ?? 0, saves: row.save_count ?? 0, comments: row.comment_count ?? 0, copies: row.copy_count ?? 0 };
}

function tagsOf(row: PromptRow): { label: string }[] {
  return (row.prompt_tags ?? []).flatMap((entry) => (entry.tags ? [{ label: entry.tags.label }] : []));
}

function clip(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function toExchange(row: PromptRow, siteUrl: string, variables: VariableRow[]): ExchangePrompt {
  return toExchangePrompt(
    {
      title: row.title,
      description: row.description ?? "",
      promptText: row.prompt_text,
      contentType: row.content_type ?? "text",
      category: row.category,
      subcategory: row.subcategory,
      tools: toolsOf(row),
      tags: tagsOf(row),
    },
    variables.map((variable) => ({
      name: variable.name,
      defaultValue: variable.default_value ?? "",
      description: variable.description,
      type: variable.type ?? "text",
      options: parseOptions(variable.options),
      config: variable.config && typeof variable.config === "object" && !Array.isArray(variable.config) ? (variable.config as object) : {},
    })),
    { credit: `@${authorOf(row).username} · Promptly`, url: promptUrl(siteUrl, row.id) },
  );
}

/** Saklanan seçenekler `{label, value, color?, image?}` dizisidir; görsel (data URL) dışarı verilmez, bozuk girdi atılır. */
function parseOptions(raw: unknown): { label: string; value: string; color?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const option = entry as Record<string, unknown>;
    if (typeof option.label !== "string" || typeof option.value !== "string") return [];
    return typeof option.color === "string" ? [{ label: option.label, value: option.value, color: option.color }] : [{ label: option.label, value: option.value }];
  });
}

export function toSummary(row: PromptRow, siteUrl: string): PublicPromptSummary {
  const exchange = toExchange(row, siteUrl, []);
  return {
    id: row.id,
    url: promptUrl(siteUrl, row.id),
    title: exchange.title,
    description: clip(exchange.description, PUBLIC_LIMITS.descriptionChars),
    promptPreview: clip(exchange.promptText, PUBLIC_LIMITS.previewChars),
    contentType: exchange.contentType,
    category: exchange.category,
    subcategory: exchange.subcategory,
    tools: exchange.tools,
    tags: exchange.tags,
    variableNames: extractVariableTokenNames(exchange.promptText),
    author: authorOf(row),
    stats: statsOf(row),
    createdAt: row.created_at,
  };
}

function toPublicPrompt(row: PromptRow, siteUrl: string, variables: VariableRow[]): PublicPrompt {
  return { id: row.id, url: promptUrl(siteUrl, row.id), ...toExchange(row, siteUrl, variables), author: authorOf(row), stats: statsOf(row), createdAt: row.created_at };
}

// ---------------------------------------------------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------------------------------------------------

function bad(message: string): never {
  throw new PublicApiError("bad_request", message);
}

export function clampLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || Number.isNaN(limit)) return PUBLIC_LIMITS.defaultLimit;
  if (!Number.isInteger(limit) || limit < 1) bad("limit must be a positive integer.");
  return Math.min(limit, PUBLIC_LIMITS.maxLimit);
}

function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[], name: string, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (!(allowed as readonly string[]).includes(value)) bad(`${name} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}

function optionalContentType(value: string | null | undefined): ExchangeContentType | null {
  if (value === null || value === undefined || value === "") return null;
  return oneOf(value, CONTENT_TYPES, "content_type", "text");
}

function slugList(values: string[] | null | undefined, name: string, pattern: RegExp): string[] | null {
  const list = (values ?? []).map((value) => value.trim()).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length > PUBLIC_LIMITS.filterItems) bad(`At most ${PUBLIC_LIMITS.filterItems} ${name} values.`);
  if (list.some((value) => !pattern.test(value))) bad(`Invalid ${name} value.`);
  return [...new Set(list)];
}

function optionalSlug(value: string | null | undefined, name: string): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (!SLUG_PATTERN.test(text)) bad(`Invalid ${name}.`);
  return text;
}

interface SearchCursor {
  r: number;
  c: string;
  i: string;
}

function encodeCursor(cursor: SearchCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(raw: string): SearchCursor {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const value = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as Partial<SearchCursor>;
    if (typeof value.r === "number" && Number.isFinite(value.r) && typeof value.c === "string" && !Number.isNaN(Date.parse(value.c)) && typeof value.i === "string" && isUuid(value.i)) {
      return { r: value.r, c: value.c, i: value.i };
    }
  } catch {
    // aşağıda tek hata
  }
  return bad("Invalid cursor.");
}

// ---------------------------------------------------------------------------------------------------------------------
// Sorgular
// ---------------------------------------------------------------------------------------------------------------------

async function fetchRowsByIds(client: RestClient, ids: string[]): Promise<PromptRow[]> {
  if (ids.length === 0) return [];
  const params = publicFilters(new URLSearchParams({ select: PROMPT_COLUMNS }));
  params.set("id", `in.(${ids.join(",")})`);
  params.set("limit", String(ids.length));
  const rows = await client.select<PromptRow>("prompts", params);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Herkese açık promptlarda arama — sitenin kendi arama RPC'si `search_content` (SECURITY INVOKER: RLS atlanmaz; başlık + açıklama +
 * prompt metni; keyset). Sorgu boşsa en yeni/popüler liste döner. Satırlar sonra tek sorguyla doldurulur; arada kaybolan satır atlanır,
 * imleç yine veritabanının döndürdüğü son satırdan devam eder (`lib/supabase/search.ts` ile aynı kural).
 */
export async function searchPrompts(client: RestClient, input: SearchParams = {}): Promise<Page<PublicPromptSummary>> {
  const limit = clampLimit(input.limit);
  const query = (input.query ?? "").trim().slice(0, PUBLIC_LIMITS.query);
  const sort = oneOf(input.sort, PUBLIC_SORTS, "sort", query ? "relevant" : "new");
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const rows = await client.rpc<{ id: string; created_at: string; sort_rank: number | string }[]>("search_content", {
    p_kind: "prompt",
    p_query: query || null,
    p_sort: sort,
    p_author_ids: null,
    p_content_types: null,
    p_content_type: optionalContentType(input.contentType),
    p_category: optionalSlug(input.category, "category"),
    p_subcategory: optionalSlug(input.subcategory, "subcategory"),
    // Etiket adı da verilebilir ("Karakter Tasarımı"): sunucunun slug kuralıyla (`normalize_tag_name`) çevrilir.
    p_tag_slugs: slugList(input.tags?.map(normalizeTagLabel), "tag", SLUG_PATTERN),
    p_tool_refs: slugList(input.tools, "tool", TOOL_REF_PATTERN),
    p_limit: limit,
    p_after_rank: cursor ? cursor.r : null,
    p_after_created_at: cursor ? cursor.c : null,
    p_after_id: cursor ? cursor.i : null,
  });
  const list = rows ?? [];
  const last = list[list.length - 1];
  const hydrated = await fetchRowsByIds(client, list.map((row) => row.id));
  return {
    items: hydrated.map((row) => toSummary(row, client.siteUrl)),
    nextCursor: list.length >= limit && last ? encodeCursor({ r: Number(last.sort_rank), c: last.created_at, i: last.id }) : null,
  };
}

const PERIOD_DAYS: Record<PopularPeriod, number | null> = { week: 7, month: 30, year: 365, all: null };

/**
 * En çok kopyalanan / beğenilen herkese açık promptlar. `period` yalnız o süre içinde YAYINLANAN promptları alır (sayaçlar tüm
 * zamanlıdır — "bu hafta en çok kopyalanan" değil, "bu hafta paylaşılanların en çok kopyalananı"). Sayfasız: en çok 50.
 */
export async function popularPrompts(client: RestClient, input: PopularParams = {}, now: Date = new Date()): Promise<PublicPromptSummary[]> {
  const limit = clampLimit(input.limit);
  const period = oneOf(input.period, POPULAR_PERIODS, "period", "all");
  const by = oneOf(input.by, POPULAR_BY, "by", "copies");
  const params = publicFilters(new URLSearchParams({ select: PROMPT_COLUMNS }));
  const contentType = optionalContentType(input.contentType);
  if (contentType) params.set("content_type", `eq.${contentType}`);
  const days = PERIOD_DAYS[period];
  if (days !== null) params.set("created_at", `gte.${new Date(now.getTime() - days * 86_400_000).toISOString()}`);
  params.set("order", by === "copies" ? "copy_count.desc,like_count.desc,created_at.desc,id.desc" : "like_count.desc,copy_count.desc,created_at.desc,id.desc");
  params.set("limit", String(limit));
  const rows = await client.select<PromptRow>("prompts", params);
  return rows.map((row) => toSummary(row, client.siteUrl));
}

async function fetchVariables(client: RestClient, ids: string[]): Promise<Map<string, VariableRow[]>> {
  const out = new Map<string, VariableRow[]>();
  if (ids.length === 0) return out;
  // Prompt başına en çok 30 değişken (DB + değişim sınırı); çağıranlar en çok 50 prompt ister → ≤ 1500. 1000'lik kesmeye takılmasın diye 25'erli.
  for (let start = 0; start < ids.length; start += 25) {
    const chunk = ids.slice(start, start + 25);
    const params = new URLSearchParams({ select: VARIABLE_COLUMNS, prompt_id: `in.(${chunk.join(",")})`, order: "prompt_id.asc,sort_order.asc,id.asc" });
    params.set("limit", String(chunk.length * 30));
    for (const row of await client.select<VariableRow>("prompt_variables", params)) {
      const list = out.get(row.prompt_id) ?? [];
      list.push(row);
      out.set(row.prompt_id, list);
    }
  }
  return out;
}

/** Tek prompt, değişken tanımlarıyla. Yoksa / herkese açık değilse / topluluğa aitse `not_found` (varlığı sızmaz). */
export async function getPrompt(client: RestClient, id: string): Promise<PublicPrompt> {
  const key = id.trim();
  if (!isUuid(key)) bad("id must be a prompt UUID.");
  const [row] = await fetchRowsByIds(client, [key]);
  if (!row) throw new PublicApiError("not_found", "Prompt not found.");
  const variables = await fetchVariables(client, [row.id]);
  return toPublicPrompt(row, client.siteUrl, variables.get(row.id) ?? []);
}

/** Birden çok prompt, değişkenleriyle, verilen sırada (MCP'nin hazır prompt listesi). Okunamayanlar atlanır. */
export async function getPrompts(client: RestClient, ids: string[]): Promise<PublicPrompt[]> {
  const keys = [...new Set(ids.filter(isUuid))].slice(0, PUBLIC_LIMITS.maxLimit);
  const rows = await fetchRowsByIds(client, keys);
  const variables = await fetchVariables(client, rows.map((row) => row.id));
  return rows.map((row) => toPublicPrompt(row, client.siteUrl, variables.get(row.id) ?? []));
}

// ---------------------------------------------------------------------------------------------------------------------
// Doldurma (ağsız)
// ---------------------------------------------------------------------------------------------------------------------

const MAX_VALUE_CHARS = 5000;

/**
 * `{ad}` jetonlarını doldurur — sitedeki `resolvePromptText` ile aynı kural (eşleşmeyen jeton metinde AYNEN kalır). Verilmeyen değişken
 * tanımlıysa varsayılanını alır. Değer metni olduğu gibi konur; çıktı yine kullanıcı içeriğidir.
 */
export function fillPrompt(prompt: Pick<ExchangePrompt, "promptText" | "variables">, input: Record<string, unknown> = {}): FillResult {
  const given: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    const text = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : Array.isArray(value) ? value.map(String).join(", ") : null;
    if (text === null) bad(`Value of "${key}" must be text.`);
    if (text.length > MAX_VALUE_CHARS) bad(`Value of "${key}" is too long.`);
    given[key] = text;
  }
  const tokens = extractVariableTokenNames(prompt.promptText);
  const defaults = new Map<string, ExchangeVariable>(prompt.variables.map((variable) => [variable.name, variable]));
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of tokens) {
    if (Object.prototype.hasOwnProperty.call(given, name)) values[name] = given[name];
    else if (defaults.get(name)?.defaultValue) values[name] = defaults.get(name)!.defaultValue;
    else missing.push(name);
  }
  return { text: resolvePromptText(prompt.promptText, values), values, missing, unknown: Object.keys(given).filter((key) => !tokens.includes(key)) };
}

/**
 * MCP prompt adı: başlıktan ASCII slug + kimliğin SON 8 onaltılık karakteri (istemci komut satırında güvenli). Son kısım: seed
 * kimlikleri ortak önekle başlar (`5eed0001-…`), ilk 8 karakter aynı başlıklı iki promptta çakışırdı.
 */
export function promptSlug(title: string, id: string): string {
  const slug = title
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${slug || "prompt"}-${id.replace(/-/g, "").slice(-8)}`;
}
