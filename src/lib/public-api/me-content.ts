/**
 * "Benim hesabım" yüzeyinin İSTEK / HAZIR AYAR / WORKFLOW ve TASLAK GÜNCELLEME kısmı (docs/history/321-*). `me.ts` ile aynı ilkeler: her işlev
 * `withUser` içinde, kullanıcı olarak çalışır; kural veritabanındadır (INVOKER RPC'ler: RLS, askı, hız sınırı atlanmaz), burası yalnız taşır.
 *
 * Sınırlar (kullanıcı kararı, 321): yalnız ÖZEL TASLAK eklenir ve güncellenir; yayınlama, görünürlük değiştirme ve silme bu yüzeyde YOKTUR.
 * Güncelleme `expectedUpdatedAt` ister (en son okunan sürüm); kayıt o sırada değiştiyse reddedilir (409) — istemci önce yeniden okur.
 */
import { parseContent, type ExchangeContentKind } from "../exchange/content-format.ts";
import { ME_LIMITS, type MeImportReport, type MeIdentity, type MePage, type MeTx } from "./me.ts";
import { isUuid } from "./prompts.ts";
import { PublicApiError } from "./rest.ts";

/** Bu yüzeyde okunup/eklenen içerik türleri (Prompt `me.ts`'tedir). */
export type MeContentKind = ExchangeContentKind;
/** Taslağı güncellenebilen türler (Prompt dahil). */
export type MeDraftKind = "prompt" | MeContentKind;

export const ME_CONTENT_KINDS: readonly MeContentKind[] = ["request", "preset", "workflow"];
export const ME_DRAFT_KINDS: readonly MeDraftKind[] = ["prompt", "request", "preset", "workflow"];

/** URL parçası (çoğul) → tür. */
export const ME_KIND_SEGMENTS: Record<string, MeContentKind> = { requests: "request", presets: "preset", workflows: "workflow" };

const LIST_FN: Record<MeContentKind, string> = { request: "api_me_requests", preset: "api_me_presets", workflow: "api_me_workflows" };
const GET_FN: Record<MeContentKind, string> = { request: "api_me_request", preset: "api_me_preset", workflow: "api_me_workflow" };
const DETAIL_PATH: Record<MeDraftKind, string> = { prompt: "/prompts/local", request: "/requests/local", preset: "/presets/local", workflow: "/workflows/local" };
const EDIT_PATH: Record<MeDraftKind, string> = { prompt: "/create", request: "/requests/new", preset: "/presets/create", workflow: "/workflows/create" };

/** Sitedeki düzenleme formu (yayınlama orada yapılır). */
export function editUrl(siteUrl: string, kind: MeDraftKind, id: string): string {
  return `${siteUrl}${EDIT_PATH[kind]}?edit=${encodeURIComponent(id)}`;
}

/** Sitedeki ayrıntı sayfası (yalnız sahibi taslağı görür). */
export function detailUrl(siteUrl: string, kind: MeDraftKind, id: string): string {
  return `${siteUrl}${DETAIL_PATH[kind]}?id=${encodeURIComponent(id)}`;
}

export interface MeContentSummary {
  id: string;
  title: string;
  description: string;
  contentType: string;
  status: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  editUrl: string;
}

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value ?? ""));
const TIME = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

function clampLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined) return ME_LIMITS.defaultLimit;
  if (!Number.isInteger(limit) || limit < 1 || limit > ME_LIMITS.maxLimit) throw new PublicApiError("bad_request", `limit must be an integer between 1 and ${ME_LIMITS.maxLimit}.`);
  return limit;
}

function encodeCursor(time: string, id: string): string {
  return btoa(`${time}|${id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string | null | undefined): { time: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const [time, id] = raw.split("|");
    if (!time || !id || !isUuid(id) || Number.isNaN(Date.parse(time))) throw new Error("bad");
    return { time, id };
  } catch {
    throw new PublicApiError("bad_request", "cursor is not valid.");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Kimlik: kim olarak bağlıyım?
// ---------------------------------------------------------------------------------------------------------------------

export interface MeWhoami {
  user: { id: string; username: string | null; displayName: string | null; avatarUrl: string | null; profileUrl: string | null };
  scopes: string[];
  via: "key" | "oauth";
}

/** Oturumun sahibi: kullanıcı adı, görünen ad, avatar ve profil bağlantısı + kapsamlar. Yazma kapsamı yoksa taslak eklenemez/güncellenemez. */
export async function getWhoami(tx: MeTx, identity: MeIdentity, siteUrl: string): Promise<MeWhoami> {
  const [row] = await tx("select user_id, username, display_name, avatar_url from public.api_me_whoami()");
  const username = row?.username ? String(row.username) : null;
  return {
    user: {
      id: identity.userId,
      username,
      displayName: row?.display_name ? String(row.display_name) : null,
      avatarUrl: row?.avatar_url ? String(row.avatar_url) : null,
      profileUrl: username ? `${siteUrl}/profile/real?username=${encodeURIComponent(username)}` : null,
    },
    scopes: identity.scopes,
    via: identity.via,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------------------------------------------------

function summaryOf(kind: MeContentKind, row: Record<string, unknown>, siteUrl: string): MeContentSummary {
  const id = String(row.id);
  return {
    id,
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    contentType: String(row.content_type ?? ""),
    status: String(row.status ?? ""),
    visibility: String(row.visibility ?? ""),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    url: detailUrl(siteUrl, kind, id),
    editUrl: editUrl(siteUrl, kind, id),
  };
}

export async function listMyContent(
  tx: MeTx,
  siteUrl: string,
  kind: MeContentKind,
  input: { limit?: number | null; cursor?: string | null; status?: string | null },
): Promise<MePage<MeContentSummary>> {
  const limit = clampLimit(input.limit);
  const status = input.status ?? null;
  if (status !== null && status !== "draft" && status !== "published") throw new PublicApiError("bad_request", "status must be draft or published.");
  const after = decodeCursor(input.cursor);
  const rows = await tx(
    `select r.*, to_char(r.created_at at time zone 'utc', ${TIME}) as created_cursor from public.${LIST_FN[kind]}($1, $2::timestamptz, $3::uuid, $4) r`,
    [limit + 1, after?.time ?? null, after?.id ?? null, status],
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { items: page.map((row) => summaryOf(kind, row, siteUrl)), nextCursor: rows.length > limit && last ? encodeCursor(String(last.created_cursor), String(last.id)) : null };
}

/** Ayrıntı: veritabanının `jsonb` yanıtı olduğu gibi + bağlantılar. `updatedAt` güncellemede `expectedUpdatedAt` olarak geri verilir. */
export async function getMyContent(tx: MeTx, siteUrl: string, kind: MeContentKind, id: string): Promise<Record<string, unknown>> {
  if (!isUuid(id)) throw new PublicApiError("bad_request", "id must be a UUID.");
  const [row] = await tx(`select public.${GET_FN[kind]}($1::uuid) as detail`, [id]);
  const detail = row?.detail;
  if (!detail || typeof detail !== "object") throw new PublicApiError("not_found", `No such ${kind} in your account.`);
  return { ...(detail as Record<string, unknown>), url: detailUrl(siteUrl, kind, id), editUrl: editUrl(siteUrl, kind, id) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ekleme (hep özel taslak)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Kendi hesabına özel TASLAK yazar: gövde, sitedeki "Dışa aktar"ın JSON dosyasıdır (`promptly.requests|presets|workflows`; başka türün dosyası
 * reddedilir). Doğrulama ve yazma yalnız `import_content` / `import_workflows` RPC'lerindedir (önce doğrula, sonra tek işlemde yaz; hep özel
 * taslak; askı/hız sınırı geçerli; en çok 30).
 */
export async function importMyContent(tx: MeTx, siteUrl: string, kind: MeContentKind, bodyText: string, dryRun: boolean): Promise<MeImportReport> {
  if (new TextEncoder().encode(bodyText).length > ME_LIMITS.importMaxBytes) throw new PublicApiError("bad_request", "Request body is too large.");
  const parsed = parseContent(kind, bodyText, ME_LIMITS.importMaxItems);
  if (parsed.fatal) throw new PublicApiError("bad_request", `Body is not a valid Promptly ${kind} file (${parsed.fatal}).`);
  if (parsed.items.length === 0) throw new PublicApiError("bad_request", `The file has no ${kind} items.`);
  const items = JSON.stringify(parsed.items);
  // `$n::text::jsonb`: Edge sürücüsü (postgres.js) jsonb parametresini kendisi JSON.stringify eder → çift kodlama; text olarak gönderilip sunucuda çevrilir.
  const [row] =
    kind === "workflow"
      ? await tx("select public.import_workflows($1::text::jsonb, $2) as report", [items, dryRun])
      : await tx("select public.import_content($1, $2::text::jsonb, $3) as report", [kind, items, dryRun]);
  const report = (row?.report ?? { dryRun, ok: false, created: 0, items: [] }) as MeImportReport;
  const withLinks = {
    ...report,
    items: (Array.isArray(report.items) ? report.items : []).map((item) => {
      const id = item && typeof item === "object" ? (item as { id?: unknown }).id : null;
      return typeof id === "string" ? { ...(item as object), editUrl: editUrl(siteUrl, kind, id) } : item;
    }),
  };
  return parsed.issues.length ? { ...withLinks, skipped: parsed.issues } : withLinks;
}

// ---------------------------------------------------------------------------------------------------------------------
// Taslak güncelleme
// ---------------------------------------------------------------------------------------------------------------------

export interface MeUpdateResult {
  id: string;
  /** Gerçekten yazılan alanlar. */
  changed: string[];
  warnings: unknown[];
  /** Yeni çakışma belirteci: bir sonraki güncellemede `expectedUpdatedAt` olarak kullanılır. */
  updatedAt: string;
  url: string;
  editUrl: string;
}

/** Güncellenebilen alanlar (veritabanı da aynısını zorlar; bilinmeyen alan reddedilir). Metin ve yönergeler araç açıklamalarında bundan okur. */
export const ME_PATCH_FIELDS: Record<MeDraftKind, readonly string[]> = {
  prompt: ["title", "description", "promptText", "contentType", "category", "subcategory", "tools", "tags"],
  request: ["title", "description", "creativeDirection", "contentType", "category", "subcategory", "tools", "tags"],
  preset: ["title", "description", "contentType", "category", "subcategory", "tools", "tags", "selection"],
  workflow: ["title", "description", "category", "subcategory", "tools", "tags", "stepEdits"],
};

const FIELD_NOTE = (field: string | undefined) => (field ? ` (field: ${field})` : "");

/** Veritabanı kodu → HTTP/MCP hatası. `conflict` ve `not_draft` ayrı ele alınır: istemcinin ne yapacağı farklıdır. */
function updateError(result: { code?: unknown; field?: unknown; currentUpdatedAt?: unknown }): PublicApiError {
  const code = String(result.code ?? "");
  const field = typeof result.field === "string" ? result.field : undefined;
  switch (code) {
    case "not_found":
      return new PublicApiError("not_found", "No such draft in your account.");
    case "conflict":
      return new PublicApiError(
        "conflict",
        `The draft changed since you read it (currentUpdatedAt: ${String(result.currentUpdatedAt ?? "")}). Read it again, apply your change on top of the current content, then retry with the new updatedAt.`,
      );
    case "not_draft":
      return new PublicApiError("unprocessable", "Only private drafts can be changed here. Published content is edited on the site.");
    case "expected_required":
      return new PublicApiError("bad_request", "expectedUpdatedAt is required: pass the updatedAt value you read last.");
    case "invalid_patch":
    case "no_changes":
    case "unknown_field":
      return new PublicApiError("bad_request", code === "unknown_field" ? `Field cannot be changed here${FIELD_NOTE(field)}.` : "Send an object with at least one field to change.");
    default:
      return new PublicApiError("unprocessable", `The change was refused: ${code || "invalid"}${FIELD_NOTE(field)}. Nothing was written.`);
  }
}

/**
 * Bir taslağı günceller (yalnız verilen alanlar). Kayıt sahibine ait, yayınlanmamış ve `expectedUpdatedAt` ile aynı sürümde olmalıdır; aksi
 * hâlde HİÇBİR ŞEY yazılmaz. Yayınlama/görünürlük/silme bu işlevde yoktur ve yama ile de yapılamaz (veritabanı bilinmeyen alanı reddeder).
 */
export async function updateMyDraft(
  tx: MeTx,
  siteUrl: string,
  kind: MeDraftKind,
  id: string,
  patch: unknown,
  expectedUpdatedAt: unknown,
): Promise<MeUpdateResult> {
  if (!isUuid(id)) throw new PublicApiError("bad_request", "id must be a UUID.");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new PublicApiError("bad_request", "changes must be an object.");
  if (typeof expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(expectedUpdatedAt))) {
    throw new PublicApiError("bad_request", "expectedUpdatedAt is required: pass the updatedAt value you read last (ISO time).");
  }
  const body = JSON.stringify(patch);
  if (new TextEncoder().encode(body).length > ME_LIMITS.importMaxBytes) throw new PublicApiError("bad_request", "Request body is too large.");
  const [row] = await tx("select public.api_me_update_draft($1, $2::uuid, $3::text::jsonb, $4::timestamptz) as result", [kind, id, body, expectedUpdatedAt]);
  const result = (row?.result ?? null) as { ok?: boolean; id?: string; changed?: string[]; warnings?: unknown[]; updatedAt?: string; code?: unknown; field?: unknown; currentUpdatedAt?: unknown } | null;
  if (!result) throw new PublicApiError("upstream", "Could not complete the request.");
  if (!result.ok) throw updateError(result);
  return {
    id,
    changed: Array.isArray(result.changed) ? result.changed.map(String) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    updatedAt: String(result.updatedAt ?? ""),
    url: detailUrl(siteUrl, kind, id),
    editUrl: editUrl(siteUrl, kind, id),
  };
}
