/**
 * Açık API çekirdeği — herkese açık bir promptun ALT KAYNAKLARI: sonuçlar, sürümler, yorumlar (docs/history/432-*). `prompts.ts` ile aynı ilkeler:
 * yalnız ANON anahtar (sitenin oturumsuz ziyaretçisinin yetkisi), yalnız yayında + herkese açık + topluluğa ait olmayan prompt (önce doğrulanır; yoksa
 * `not_found`, varlığı sızmaz), her liste sınırlı, yeni SQL yok — satırları RLS kendi kuralıyla süzer.
 *
 * Kullanıcı içeriği veridir, talimat değil: MCP/uzantı katmanı bunu böyle işler. Her satır yazar adı taşır; yorum ve sonuç metni kısaltılır.
 */
import { assertPublicPrompt, decodeCursor, encodeCursor, isUuid, PUBLIC_LIMITS, type Page, type PublicAuthor } from "./prompts.ts";
import { PublicApiError, type RestClient } from "./rest.ts";

const CLIP_RESULT = 600;
const CLIP_COMMENT = 1500;
const MAX_REPLIES = 100;
const THUMBNAIL_TTL_SECONDS = 10 * 60;

interface ProfileEmbed {
  username: string;
  display_name: string | null;
}
type MaybeProfile = ProfileEmbed | ProfileEmbed[] | null | undefined;

function authorOf(profile: MaybeProfile): PublicAuthor {
  const p = Array.isArray(profile) ? profile[0] : profile;
  return { username: p?.username ?? "unknown", displayName: p?.display_name ?? null };
}

function clip(text: string | null | undefined, max: number): string {
  const clean = (text ?? "").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function limitOf(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || Number.isNaN(limit)) return PUBLIC_LIMITS.defaultLimit;
  if (!Number.isInteger(limit) || limit < 1) throw new PublicApiError("bad_request", "limit must be a positive integer.");
  return Math.min(limit, PUBLIC_LIMITS.maxLimit);
}

/** Zaman damgası PostgREST'te metin olarak taşınır (mikrosaniye korunur); süzgeç değerine girmeden ayrıştırma karakterlerinden arındırılır. */
function safeTime(value: string): string {
  return value.replace(/[^0-9TZ:.+\- ]/g, "");
}

function keysetFilter(params: URLSearchParams, column: string, cursor: { c: string; i: string } | null): void {
  if (!cursor) return;
  const time = safeTime(cursor.c);
  params.set("or", `(${column}.lt.${time},and(${column}.eq.${time},id.lt.${cursor.i}))`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Sonuçlar
// ---------------------------------------------------------------------------------------------------------------------

export interface PublicResult {
  id: string;
  author: PublicAuthor;
  mediaType: string;
  /** Görsel sonucun KISA ÖMÜRLÜ (≈10 dk) imzalı küçük resmi; görsel değilse ya da imzalanamadıysa null. Kalıcı değil: saklama. */
  imageUrl: string | null;
  text: string;
  tool: string | null;
  modified: boolean;
  modificationSummary: string;
  likes: number;
  comments: number;
  createdAt: string;
  /** Sitede sonucun sayfası. */
  url: string;
}

interface ResultRow {
  id: string;
  media_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  text_content: string | null;
  tool: string | null;
  has_modification: boolean | null;
  modification_summary: string | null;
  like_count: number | null;
  comment_count: number | null;
  created_at: string;
  profiles: MaybeProfile;
}

const RESULT_COLUMNS = "id,media_type,media_url,thumbnail_url,text_content,tool,has_modification,modification_summary,like_count,comment_count,created_at,profiles:creator_id(username,display_name)";
const RESULT_BUCKET = "result-media";
const RESULT_PATH = /\/object\/(?:public|sign|authenticated)\/result-media\/([^?#]+)/;

function resultPathOf(url: string | null | undefined): string | null {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return null;
  const match = RESULT_PATH.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export async function listPromptResults(client: RestClient, id: string, input: { limit?: number | null; cursor?: string | null } = {}): Promise<Page<PublicResult>> {
  const promptKey = await assertPublicPrompt(client, id);
  const limit = limitOf(input.limit);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const params = new URLSearchParams({ select: RESULT_COLUMNS, prompt_id: `eq.${promptKey}`, order: "created_at.desc,id.desc", limit: String(limit + 1) });
  keysetFilter(params, "created_at", cursor);
  const rows = await client.select<ResultRow>("prompt_results", params);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const wanted = page.flatMap((row) => {
    const path = row.media_type === "image" ? resultPathOf(row.thumbnail_url) ?? resultPathOf(row.media_url) : null;
    return path ? [{ id: row.id, path }] : [];
  });
  const signed = new Map<string, string>();
  if (wanted.length > 0 && client.signUrls) {
    try {
      const urls = await client.signUrls(RESULT_BUCKET, wanted.map((w) => w.path), THUMBNAIL_TTL_SECONDS);
      wanted.forEach((w, i) => {
        const url = urls[i];
        if (typeof url === "string" && /^https:\/\//.test(url)) signed.set(w.id, url);
      });
    } catch {
      // görselsiz devam
    }
  }
  return {
    items: page.map((row) => ({
      id: row.id,
      author: authorOf(row.profiles),
      mediaType: row.media_type ?? "text",
      imageUrl: signed.get(row.id) ?? null,
      text: clip(row.text_content, CLIP_RESULT),
      tool: row.tool,
      modified: row.has_modification === true,
      modificationSummary: clip(row.modification_summary, CLIP_RESULT),
      likes: row.like_count ?? 0,
      comments: row.comment_count ?? 0,
      createdAt: row.created_at,
      url: `${client.siteUrl}/results/local?id=${encodeURIComponent(row.id)}`,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor({ r: 0, c: last.created_at, i: last.id }) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Sürümler
// ---------------------------------------------------------------------------------------------------------------------

export interface PublicVersion {
  id: string;
  versionNumber: number;
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  /** Sürümün kaynağı (`edit`, `suggestion`, `restore`…); olduğu gibi. */
  source: string | null;
  author: PublicAuthor;
  createdAt: string;
}

interface VersionRow {
  id: string;
  version_number: number;
  title: string;
  description: string | null;
  prompt_text: string;
  tool: string | null;
  source: string | null;
  created_at: string;
  profiles: MaybeProfile;
}

export async function listPromptVersions(client: RestClient, id: string, input: { limit?: number | null; cursor?: string | null } = {}): Promise<Page<PublicVersion>> {
  const promptKey = await assertPublicPrompt(client, id);
  const limit = limitOf(input.limit);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const params = new URLSearchParams({
    select: "id,version_number,title,description,prompt_text,tool,source,created_at,profiles:created_by(username,display_name)",
    prompt_id: `eq.${promptKey}`,
    order: "version_number.desc,id.desc",
    limit: String(limit + 1),
  });
  if (cursor) params.set("version_number", `lt.${Math.trunc(cursor.r)}`);
  const rows = await client.select<VersionRow>("prompt_versions", params);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      versionNumber: row.version_number,
      title: row.title,
      description: clip(row.description, PUBLIC_LIMITS.descriptionChars),
      promptText: row.prompt_text,
      tool: row.tool,
      source: row.source,
      author: authorOf(row.profiles),
      createdAt: row.created_at,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor({ r: last.version_number, c: last.created_at, i: last.id }) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Yorumlar
// ---------------------------------------------------------------------------------------------------------------------

export interface PublicComment {
  id: string;
  author: PublicAuthor;
  text: string;
  likes: number;
  pinned: boolean;
  edited: boolean;
  createdAt: string;
  /** Yanıtlar (eskiden yeniye); üst düzey yorumda dolu, yanıtın kendisinde boş. Bir istekte en çok 100 yanıt döner. */
  replies: PublicComment[];
}

interface CommentRow {
  id: string;
  parent_id: string | null;
  body: string;
  like_count: number | null;
  pinned_at: string | null;
  edited_at: string | null;
  created_at: string;
  profiles: MaybeProfile;
}

const COMMENT_COLUMNS = "id,parent_id,body,like_count,pinned_at,edited_at,created_at,profiles:author_id(username,display_name)";

function toComment(row: CommentRow, replies: PublicComment[] = []): PublicComment {
  return {
    id: row.id,
    author: authorOf(row.profiles),
    text: clip(row.body, CLIP_COMMENT),
    likes: row.like_count ?? 0,
    pinned: Boolean(row.pinned_at),
    edited: Boolean(row.edited_at),
    createdAt: row.created_at,
    replies,
  };
}

/** Üst düzey yorumlar en yeni önce (sitenin varsayılanı; sabit yorum işaretlidir), yanıtlar eskiden yeniye. */
export async function listPromptComments(client: RestClient, id: string, input: { limit?: number | null; cursor?: string | null } = {}): Promise<Page<PublicComment>> {
  const promptKey = await assertPublicPrompt(client, id);
  const limit = limitOf(input.limit);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const params = new URLSearchParams({
    select: COMMENT_COLUMNS,
    prompt_id: `eq.${promptKey}`,
    parent_id: "is.null",
    deleted_at: "is.null",
    order: "created_at.desc,id.desc",
    limit: String(limit + 1),
  });
  keysetFilter(params, "created_at", cursor);
  const rows = await client.select<CommentRow>("prompt_comments", params);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const repliesByParent = new Map<string, PublicComment[]>();
  const parentIds = page.map((row) => row.id).filter(isUuid);
  if (parentIds.length > 0) {
    const replyParams = new URLSearchParams({
      select: COMMENT_COLUMNS,
      prompt_id: `eq.${promptKey}`,
      parent_id: `in.(${parentIds.join(",")})`,
      deleted_at: "is.null",
      order: "created_at.asc,id.asc",
      limit: String(MAX_REPLIES),
    });
    for (const row of await client.select<CommentRow>("prompt_comments", replyParams)) {
      if (!row.parent_id) continue;
      const list = repliesByParent.get(row.parent_id) ?? [];
      list.push(toComment(row));
      repliesByParent.set(row.parent_id, list);
    }
  }
  return {
    items: page.map((row) => toComment(row, repliesByParent.get(row.id) ?? [])),
    nextCursor: rows.length > limit && last ? encodeCursor({ r: 0, c: last.created_at, i: last.id }) : null,
  };
}
