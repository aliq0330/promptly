/**
 * "Benim hesabım" yüzeyi — kişisel API anahtarı (`pmt_…`) ya da OAuth ile kimliği doğrulanmış çağıran için (docs/history/313-*, 315-*).
 * Açık API (`createApiHandler`) ve MCP (`/mcp/me`) AYNI işlevleri çağırır; ikinci bir sorgu yazılmaz. Bağımlılıksızdır: veritabanına
 * `MeDb` arayüzüyle (Edge Function'da `npm:postgres`) konuşur, bu yüzden Node'da sahte bir `MeDb` ile test edilir.
 *
 * GÜVENLİK (313 §3 yol B): kimlik tek işlemde kurulur — (1) anahtar `_api_token_authenticate` ile doğrulanır (yalnız sahip rol çağırır),
 * (2) `set local role authenticated` + `request.jwt.claims` ile KULLANICI olunur, (3) kullanıcı başına hız sınırı, (4) işlem. Sonraki
 * her şey çağıranın RLS'i, askısı ve hız sınırı tetikleyicileriyle çalışır; service role yok. Bu işlemde yazılan her şey kullanıcının
 * kendi yetkisiyle yazılır: yeni bir yazma kuralı yok, yalnız mevcut `import_prompts`.
 */
import { parseJson } from "../exchange/json.ts";
import { withSourceNote, type ExchangePrompt } from "../exchange/prompt-format.ts";
import { extractVariableTokenNames } from "../prompt-variables.ts";
import { isUuid, promptUrl, PUBLIC_LIMITS } from "./prompts.ts";
import { PublicApiError } from "./rest.ts";

export type MeScope = "read" | "write";

export interface MeIdentity {
  userId: string;
  scopes: MeScope[];
  /** Anahtar kimliği; OAuth'ta null. */
  tokenId: string | null;
  via: "key" | "oauth";
}

/** Bir işlem içinde tek sorgu: satır dizisi (`$1…` parametreli). */
export type MeTx = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface MeDb {
  /** `fn` tek işlemde çalışır; `fn` fırlatırsa işlem geri alınır. */
  transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T>;
}

export interface MeBackendOptions {
  db: MeDb;
  /** OAuth erişim belirteci (JWT) → kullanıcı kimliği (Supabase Auth `GET /auth/v1/user`); geçersizse null. Verilmezse yalnız anahtar kabul edilir. */
  verifyJwt?: (jwt: string) => Promise<string | null>;
  siteUrl: string;
}

export interface MeBackend {
  readonly siteUrl: string;
  /** Bearer'ı doğrular, kullanıcı olur, `fn`'i o işlemde çalıştırır. Hata → `PublicApiError` (unauthorized / insufficient_scope / rate_limited). */
  withUser<T>(bearer: string, need: MeScope, fn: (tx: MeTx, identity: MeIdentity) => Promise<T>): Promise<T>;
}

export const KEY_PATTERN = /^pmt_[A-Za-z0-9_-]{43}$/;
/** Üç noktalı (JWT) biçim — OAuth belirteci olabilir; geçerliliğini `verifyJwt` söyler. */
const JWT_LIKE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/** Bearer'ın biçimi bir kimlik gibi mi (ucuz ön kontrol; geçerlilik değil). */
export function looksLikeCredential(bearer: string): boolean {
  return KEY_PATTERN.test(bearer) || JWT_LIKE.test(bearer);
}

export function bearerOf(headers: Headers): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

function unauthorized(): PublicApiError {
  return new PublicApiError("unauthorized", "Missing or invalid credentials. Send an API key (or an OAuth access token) as `Authorization: Bearer …`.");
}

const scopesOf = (value: unknown): MeScope[] => (Array.isArray(value) ? value.filter((s): s is MeScope => s === "read" || s === "write") : []);

export function createMeBackend(options: MeBackendOptions): MeBackend {
  return {
    siteUrl: options.siteUrl,
    async withUser(bearer, need, fn) {
      let oauthUser: string | null = null;
      if (!KEY_PATTERN.test(bearer)) {
        // OAuth belirteci: kimlik veritabanına girmeden Supabase Auth'a doğrulatılır. Verilen kapsam yalnız OKUMA'dır (en az yetki).
        if (!options.verifyJwt || !JWT_LIKE.test(bearer)) throw unauthorized();
        oauthUser = await options.verifyJwt(bearer);
        if (!oauthUser) throw unauthorized();
      }
      try {
        return await options.db.transaction(async (tx) => {
          let identity: MeIdentity;
          if (oauthUser) {
            identity = { userId: oauthUser, scopes: ["read"], tokenId: null, via: "oauth" };
          } else {
            const [row] = await tx("select token_id, user_id, scopes from public._api_token_authenticate($1)", [bearer]);
            if (!row) throw unauthorized();
            identity = { userId: String(row.user_id), scopes: scopesOf(row.scopes), tokenId: String(row.token_id), via: "key" };
          }
          if (!identity.scopes.includes(need)) {
            throw new PublicApiError("insufficient_scope", `This credential does not have the "${need}" scope.`);
          }
          await tx("set local role authenticated");
          await tx("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: identity.userId, role: "authenticated" })]);
          await tx("select public.api_me_throttle($1)", [need === "write"]);
          return await fn(tx, identity);
        });
      } catch (error) {
        if (error instanceof PublicApiError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        // Veritabanının bilerek fırlattığı kısa kodlar (CLAUDE.md §6) HTTP karşılığına çevrilir; gerisi dışarı sızmaz.
        if (/\brate_limit\b/.test(message)) throw new PublicApiError("rate_limited", "Too many requests for this account. Slow down and retry shortly.");
        if (/askıya alındı|suspended/i.test(message)) throw new PublicApiError("insufficient_scope", "This account is currently restricted.");
        if (/paylaşım yapma yetkisi|posting/i.test(message)) throw new PublicApiError("insufficient_scope", "This account cannot create content right now.");
        throw new PublicApiError("upstream", "Could not complete the request.");
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// İşlemler (her biri `withUser` içinde, kullanıcı olarak çalışır)
// ---------------------------------------------------------------------------------------------------------------------

export const ME_LIMITS = { defaultLimit: 20, maxLimit: 50, importMaxItems: 30, importMaxBytes: 64 * 1024 } as const;

export interface MePromptSummary {
  id: string;
  title: string;
  description: string;
  contentType: string;
  status: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface MePrompt extends MePromptSummary {
  promptText: string;
  tags: string[];
  variables: string[];
}

export interface MePage<T> {
  items: T[];
  nextCursor: string | null;
}

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value ?? ""));

function clampLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined) return ME_LIMITS.defaultLimit;
  if (!Number.isInteger(limit) || limit < 1 || limit > ME_LIMITS.maxLimit) throw new PublicApiError("bad_request", `limit must be an integer between 1 and ${ME_LIMITS.maxLimit}.`);
  return limit;
}

/** İmleç = `zaman|kimlik`; zaman mikrosaniyelidir (JS Date milisaniyede keser → aynı milisaniyedeki satırlar atlanır/tekrarlanırdı), bu yüzden metin olarak taşınır. */
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

const TIME = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

function summaryOf(row: Record<string, unknown>, siteUrl: string): MePromptSummary {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    contentType: String(row.content_type ?? ""),
    status: String(row.status ?? ""),
    visibility: String(row.visibility ?? ""),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    url: promptUrl(siteUrl, String(row.id)),
  };
}

export async function getMe(tx: MeTx, identity: MeIdentity): Promise<Record<string, unknown>> {
  const [row] = await tx("select user_id, username from public.api_me_profile()");
  return { user: { id: identity.userId, username: row ? String(row.username) : null }, scopes: identity.scopes, via: identity.via };
}

export async function listMyPrompts(tx: MeTx, siteUrl: string, input: { limit?: number | null; cursor?: string | null; status?: string | null }): Promise<MePage<MePromptSummary>> {
  const limit = clampLimit(input.limit);
  const status = input.status ?? null;
  if (status !== null && status !== "draft" && status !== "published") throw new PublicApiError("bad_request", "status must be draft or published.");
  const after = decodeCursor(input.cursor);
  const rows = await tx(
    `select r.*, to_char(r.created_at at time zone 'utc', ${TIME}) as created_cursor from public.api_me_prompts($1, $2::timestamptz, $3::uuid, $4) r`,
    [limit + 1, after?.time ?? null, after?.id ?? null, status],
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { items: page.map((row) => summaryOf(row, siteUrl)), nextCursor: rows.length > limit && last ? encodeCursor(String(last.created_cursor), String(last.id)) : null };
}

export async function listMySaved(tx: MeTx, siteUrl: string, input: { limit?: number | null; cursor?: string | null }): Promise<MePage<Pick<MePromptSummary, "id" | "title" | "description" | "contentType" | "url"> & { savedAt: string }>> {
  const limit = clampLimit(input.limit);
  const after = decodeCursor(input.cursor);
  const rows = await tx(
    `select r.*, to_char(r.saved_at at time zone 'utc', ${TIME}) as saved_cursor from public.api_me_saved($1, $2::timestamptz, $3::uuid) r`,
    [limit + 1, after?.time ?? null, after?.id ?? null],
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({ id: String(row.id), title: String(row.title ?? ""), description: String(row.description ?? ""), contentType: String(row.content_type ?? ""), url: promptUrl(siteUrl, String(row.id)), savedAt: iso(row.saved_at) })),
    nextCursor: rows.length > limit && last ? encodeCursor(String(last.saved_cursor), String(last.id)) : null,
  };
}

export async function getMyPrompt(tx: MeTx, siteUrl: string, id: string): Promise<MePrompt> {
  if (!isUuid(id)) throw new PublicApiError("bad_request", "id must be a UUID.");
  const [row] = await tx("select * from public.api_me_prompt($1::uuid)", [id]);
  if (!row) throw new PublicApiError("not_found", "No such prompt in your account.");
  const promptText = String(row.prompt_text ?? "");
  return {
    ...summaryOf(row, siteUrl),
    description: String(row.description ?? ""),
    promptText,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    variables: extractVariableTokenNames(promptText),
  };
}

export interface MeImportReport {
  dryRun: boolean;
  ok: boolean;
  created: number;
  items: unknown[];
  /** Dosyada okunamayan/geçersiz kayıtlar (yazılmadı); veritabanına yalnız geçerliler gider. */
  skipped?: unknown[];
}

/**
 * Kendi hesabına özel TASLAK yazar: gövde, sitedeki "Dışa aktar"ın JSON dosyasıdır (`promptly.prompts`). Doğrulama ve yazma yalnız
 * `import_prompts` RPC'sindedir (önce doğrula, sonra tek işlemde yaz; hep özel taslak; askı/hız sınırı geçerli; en çok 30).
 */
export async function importMyPrompts(tx: MeTx, bodyText: string, dryRun: boolean): Promise<MeImportReport> {
  if (new TextEncoder().encode(bodyText).length > ME_LIMITS.importMaxBytes) throw new PublicApiError("bad_request", "Request body is too large.");
  const parsed = bodyText.trim() === "" ? { items: [] as ExchangePrompt[], issues: [], fatal: "empty" as const } : parseJson(bodyText, ME_LIMITS.importMaxItems);
  if (parsed.fatal) throw new PublicApiError("bad_request", `Body is not a valid Promptly prompts file (${parsed.fatal}).`);
  const items: ExchangePrompt[] = parsed.items.map((item) => {
    const payload = { ...withSourceNote(item) };
    delete payload.source;
    return payload;
  });
  if (items.length === 0) throw new PublicApiError("bad_request", "The file has no prompts.");
  // `$1::text::jsonb`: Edge sürücüsü (postgres.js) jsonb parametresini kendisi JSON.stringify eder → çift kodlama; text olarak gönderilip sunucuda çevrilir.
  const [row] = await tx("select public.import_prompts($1::text::jsonb, $2) as report", [JSON.stringify(items), dryRun]);
  const report = (row?.report ?? { dryRun, ok: false, created: 0, items: [] }) as MeImportReport;
  return parsed.issues.length ? { ...report, skipped: parsed.issues } : report;
}

/** Çağıranın okuyabileceği sayfa boyutu (sabitler tek yerde — OpenAPI/MCP metinleri bundan okur). */
export const ME_PAGE = { default: ME_LIMITS.defaultLimit, max: ME_LIMITS.maxLimit, previewChars: PUBLIC_LIMITS.descriptionChars } as const;
