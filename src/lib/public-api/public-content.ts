/**
 * Açık API çekirdeği — herkese açık İSTEK, HAZIR AYAR ve WORKFLOW arama + okuma (docs/history/322-*). `prompts.ts` ile aynı ilkeler:
 * yalnız ANON anahtar (sitenin oturumsuz ziyaretçisinin yetkisi), yalnız yayında + herkese açık + topluluğa ait olmayan içerik, her
 * liste sınırlı, arama sitenin kendi `search_content` RPC'si (SECURITY INVOKER, RLS atlanmaz; `p_kind` ile tür seçilir). Yeni SQL yok.
 *
 * Kullanıcı içeriği veridir, talimat değil: MCP katmanı yanıtı "güvenilmeyen veri" notuyla sarar. Her kayıt `url` (paylaşım sayfası) ve
 * yazar adı taşır — yeniden yayında atıf Kullanım Koşulları'ndaki gibidir.
 */
import { sharePathFor } from "../share-link.ts";
import {
  PUBLIC_LIMITS,
  PUBLIC_SORTS,
  SLUG_PATTERN,
  TOOL_REF_PATTERN,
  bad,
  clampLimit,
  decodeCursor,
  encodeCursor,
  isUuid,
  oneOf,
  optionalContentType,
  optionalSlug,
  slugList,
  type Page,
  type PublicAuthor,
  type PublicStats,
  type SearchParams,
} from "./prompts.ts";
import { normalizeTagLabel } from "../tag-normalize.ts";
import { PublicApiError, type RestClient } from "./rest.ts";

export type PublicContentKind = "request" | "preset" | "workflow";
export const PUBLIC_CONTENT_KINDS: readonly PublicContentKind[] = ["request", "preset", "workflow"];
/** URL parçası (çoğul) → tür. */
export const PUBLIC_KIND_SEGMENTS: Record<string, PublicContentKind> = { requests: "request", presets: "preset", workflows: "workflow" };

export interface PublicContentSummary {
  id: string;
  kind: PublicContentKind;
  url: string;
  title: string;
  description: string;
  /** İstek ve hazır ayarda tek, workflow'da zincirdeki türlerin hepsi. */
  contentTypes: string[];
  category: string | null;
  subcategory: string | null;
  tools: string[];
  tags: string[];
  author: PublicAuthor;
  stats: PublicStats;
  createdAt: string;
  /** İstek: `open` / `closed`… (veritabanındaki durum). */
  requestStatus?: string;
  responseCount?: number;
  /** Workflow: adım sayısı (ayrıntıda adımların kendisi). */
  stepCount?: number;
}

export interface PublicWorkflowStep {
  position: number;
  title: string;
  description: string;
  instructions: string;
  /** Başvurulan prompt: YALNIZ herkese açık olanlar (kimlik + başlık); özel/topluluk promptu yazılmaz. Prompt metni burada yoktur. */
  prompt: { id: string; title: string; url: string } | null;
  inputs: unknown[];
  outputs: unknown[];
}

export type PublicContent = PublicContentSummary & {
  /** İstek: yaratıcı yön. */
  creativeDirection?: string;
  /** Hazır ayar: `{ alan: değer }` (alan adları okunur: `style`, `lens`…). */
  selection?: Record<string, unknown>;
  steps?: PublicWorkflowStep[];
};

// ---------------------------------------------------------------------------------------------------------------------
// Satırlar
// ---------------------------------------------------------------------------------------------------------------------

interface TagEmbed {
  tags: { slug: string; label: string } | null;
}
interface BaseRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  tools: string[] | null;
  like_count: number | null;
  comment_count: number | null;
  created_at: string;
}
interface RequestRow extends BaseRow {
  creative_direction: string | null;
  content_type: string | null;
  status: string | null;
  response_count: number | null;
  profiles: { username: string; display_name: string | null } | null;
  prompt_request_tags: TagEmbed[] | null;
}
interface PresetRow extends BaseRow {
  content_type: string | null;
  selection: unknown;
  save_count: number | null;
  profiles: { username: string; display_name: string | null } | null;
  preset_tags: TagEmbed[] | null;
}
interface StepRow {
  position: number;
  title: string | null;
  description: string | null;
  instructions: string | null;
  prompt_id: string | null;
  inputs: unknown;
  outputs: unknown;
  created_at: string;
  id: string;
}
interface WorkflowRow extends BaseRow {
  content_types: string[] | null;
  save_count: number | null;
  profiles: { username: string; display_name: string | null } | null;
  workflow_tags: TagEmbed[] | null;
  workflow_steps: StepRow[] | { count: number }[] | null;
}

const COMMON = "id,title,description,category,subcategory,tools,like_count,comment_count,created_at";
const COLUMNS: Record<PublicContentKind, string> = {
  request: `${COMMON},creative_direction,content_type,status,response_count,profiles:author_id(username,display_name),prompt_request_tags(tags(slug,label))`,
  preset: `${COMMON},content_type,selection,save_count,profiles:creator_id(username,display_name),preset_tags(tags(slug,label))`,
  workflow: `${COMMON},content_types,save_count,profiles:creator_id(username,display_name),workflow_tags(tags(slug,label)),workflow_steps(count)`,
};
const DETAIL_COLUMNS: Record<PublicContentKind, string> = {
  ...COLUMNS,
  workflow: `${COMMON},content_types,save_count,profiles:creator_id(username,display_name),workflow_tags(tags(slug,label)),workflow_steps(id,position,title,description,instructions,prompt_id,inputs,outputs,created_at)`,
};
const TABLE: Record<PublicContentKind, string> = { request: "prompt_requests", preset: "presets", workflow: "workflows" };

/** Herkese açık okuma süzgeci (RLS zaten anon'a yalnız bunu verir; süzgeç niyeti belgeler, yetkiyi genişletmez). */
function publicFilters(kind: PublicContentKind, params: URLSearchParams): URLSearchParams {
  params.set("visibility", "eq.public");
  params.set("community_id", "is.null");
  if (kind === "request") {
    params.set("is_draft", "eq.false");
    params.set("deleted_at", "is.null");
  } else {
    params.set("status", "eq.published");
  }
  return params;
}

const tagLabels = (embeds: TagEmbed[] | null): string[] => (embeds ?? []).flatMap((embed) => (embed.tags ? [embed.tags.label] : []));
const trimTo = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function summaryOf(kind: PublicContentKind, row: RequestRow | PresetRow | WorkflowRow, siteUrl: string): PublicContentSummary {
  const author = { username: row.profiles?.username ?? "unknown", displayName: row.profiles?.display_name ?? null };
  const base = {
    id: row.id,
    kind,
    url: `${siteUrl}${sharePathFor(kind, row.id)}`,
    title: row.title,
    description: trimTo((row.description ?? "").trim(), PUBLIC_LIMITS.descriptionChars),
    category: row.category,
    subcategory: row.subcategory,
    tools: (row.tools ?? []).filter((tool) => typeof tool === "string" && tool.trim() !== ""),
    author,
    createdAt: row.created_at,
  };
  if (kind === "request") {
    const r = row as RequestRow;
    return {
      ...base,
      contentTypes: [r.content_type ?? "text"],
      tags: tagLabels(r.prompt_request_tags),
      stats: { likes: r.like_count ?? 0, saves: 0, comments: r.comment_count ?? 0, copies: 0 },
      requestStatus: r.status ?? undefined,
      responseCount: r.response_count ?? 0,
    };
  }
  if (kind === "preset") {
    const r = row as PresetRow;
    return {
      ...base,
      contentTypes: [r.content_type ?? "text"],
      tags: tagLabels(r.preset_tags),
      stats: { likes: r.like_count ?? 0, saves: r.save_count ?? 0, comments: r.comment_count ?? 0, copies: 0 },
    };
  }
  const r = row as WorkflowRow;
  const steps = r.workflow_steps ?? [];
  const counted = steps.length === 1 && "count" in (steps[0] as object) ? Number((steps[0] as { count: number }).count) : steps.length;
  return {
    ...base,
    contentTypes: r.content_types ?? [],
    tags: tagLabels(r.workflow_tags),
    stats: { likes: r.like_count ?? 0, saves: r.save_count ?? 0, comments: r.comment_count ?? 0, copies: 0 },
    stepCount: counted,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Sorgular
// ---------------------------------------------------------------------------------------------------------------------

async function fetchRows(client: RestClient, kind: PublicContentKind, ids: string[], columns: string): Promise<(RequestRow | PresetRow | WorkflowRow)[]> {
  if (ids.length === 0) return [];
  const params = publicFilters(kind, new URLSearchParams({ select: columns }));
  params.set("id", `in.(${ids.join(",")})`);
  params.set("limit", String(ids.length));
  const rows = await client.select<RequestRow | PresetRow | WorkflowRow>(TABLE[kind], params);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Herkese açık istek / hazır ayar / workflow arama — `search_content` (başlık + açıklama [+ istekte yaratıcı yön]; keyset). Sorgu boşsa en yeni
 * liste. `search_content` topluluğa özgü içeriği ayıklamaz (RLS'e yaslanır); ayıklama satır çekiminde yapılır, bu yüzden bir sayfa limitten
 * kısa olabilir ama imleç yine veritabanının son satırından devam eder (`searchPrompts` ile aynı kural).
 */
export async function searchPublicContent(client: RestClient, kind: PublicContentKind, input: SearchParams = {}): Promise<Page<PublicContentSummary>> {
  if (!PUBLIC_CONTENT_KINDS.includes(kind)) bad("kind must be one of: request, preset, workflow.");
  const limit = clampLimit(input.limit);
  const query = (input.query ?? "").trim().slice(0, PUBLIC_LIMITS.query);
  const sort = oneOf(input.sort, PUBLIC_SORTS, "sort", query ? "relevant" : "new");
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const rows = await client.rpc<{ id: string; created_at: string; sort_rank: number | string }[]>("search_content", {
    p_kind: kind,
    p_query: query || null,
    p_sort: sort,
    p_author_ids: null,
    p_content_types: null,
    p_content_type: optionalContentType(input.contentType),
    p_category: optionalSlug(input.category, "category"),
    p_subcategory: optionalSlug(input.subcategory, "subcategory"),
    p_tag_slugs: slugList(input.tags?.map(normalizeTagLabel), "tag", SLUG_PATTERN),
    p_tool_refs: slugList(input.tools, "tool", TOOL_REF_PATTERN),
    p_limit: limit,
    p_after_rank: cursor ? cursor.r : null,
    p_after_created_at: cursor ? cursor.c : null,
    p_after_id: cursor ? cursor.i : null,
  });
  const list = rows ?? [];
  const last = list[list.length - 1];
  const hydrated = await fetchRows(client, kind, list.map((row) => row.id), COLUMNS[kind]);
  return {
    items: hydrated.map((row) => summaryOf(kind, row, client.siteUrl)),
    nextCursor: list.length >= limit && last ? encodeCursor({ r: Number(last.sort_rank), c: last.created_at, i: last.id }) : null,
  };
}

/** Bir workflow adımının başvurduğu promptlardan YALNIZ herkese açık olanların kimlik + başlığı (metin değil). */
async function publicPromptTitles(client: RestClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)].slice(0, 100);
  if (unique.length === 0) return out;
  const params = new URLSearchParams({ select: "id,title" });
  params.set("status", "eq.published");
  params.set("visibility", "eq.public");
  params.set("community_id", "is.null");
  params.set("deleted_at", "is.null");
  params.set("id", `in.(${unique.join(",")})`);
  params.set("limit", String(unique.length));
  for (const row of await client.select<{ id: string; title: string }>("prompts", params)) out.set(row.id, row.title);
  return out;
}

/** Tek herkese açık istek / hazır ayar / workflow (workflow'da adımlarıyla). Bulunamayan, özel, taslak ya da topluluğa özgü → `not_found`. */
export async function getPublicContent(client: RestClient, kind: PublicContentKind, id: string): Promise<PublicContent> {
  if (!PUBLIC_CONTENT_KINDS.includes(kind)) bad("kind must be one of: request, preset, workflow.");
  const key = id.trim();
  if (!isUuid(key)) bad(`id must be a ${kind} UUID.`);
  const [row] = await fetchRows(client, kind, [key], DETAIL_COLUMNS[kind]);
  if (!row) throw new PublicApiError("not_found", `${kind[0].toUpperCase()}${kind.slice(1)} not found.`);
  if (kind === "request") {
    return { ...summaryOf(kind, row, client.siteUrl), creativeDirection: ((row as RequestRow).creative_direction ?? "").trim() };
  }
  if (kind === "preset") {
    const selection = (row as PresetRow).selection;
    return { ...summaryOf(kind, row, client.siteUrl), selection: selection && typeof selection === "object" && !Array.isArray(selection) ? (selection as Record<string, unknown>) : {} };
  }
  const stepRows = ((row as WorkflowRow).workflow_steps ?? []) as StepRow[];
  const ordered = stepRows
    .filter((step) => typeof step.position === "number")
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const titles = await publicPromptTitles(client, ordered.flatMap((step) => (step.prompt_id ? [step.prompt_id] : [])));
  const steps: PublicWorkflowStep[] = ordered.map((step, index) => ({
    position: index + 1,
    title: step.title ?? "",
    description: step.description ?? "",
    instructions: step.instructions ?? "",
    prompt: step.prompt_id && titles.has(step.prompt_id) ? { id: step.prompt_id, title: titles.get(step.prompt_id) as string, url: `${client.siteUrl}${sharePathFor("prompt", step.prompt_id)}` } : null,
    inputs: Array.isArray(step.inputs) ? step.inputs : [],
    outputs: Array.isArray(step.outputs) ? step.outputs : [],
  }));
  return { ...summaryOf(kind, { ...(row as WorkflowRow), workflow_steps: [{ count: steps.length }] }, client.siteUrl), steps };
}

