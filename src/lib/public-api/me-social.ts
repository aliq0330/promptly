/**
 * "Benim hesabım" yüzeyinin SOSYAL kısmı (docs/history/432-*): Ana Sayfa akışı (Sana özel / Takip), koleksiyonlar, benim durumum ve etkileşim yazmaları
 * (tepki, kaydet, koleksiyona ekle, "Çalıştı mı?" oyu, kişi takibi). `me.ts` ile aynı ilkeler: her işlev `withUser` içinde, kullanıcı olarak çalışır;
 * kural veritabanındadır (INVOKER `api_me_*` RPC'leri: RLS, askı, engel, hız sınırı ve sitedeki tetikleyiciler atlanmaz), burası yalnız taşır.
 *
 * Kapsamlar: okumalar `read`; yazmalar yeni `interact` kapsamı ister. Yazma yalnız başkasının HERKESE AÇIK promptuna tepki/kaydet/koleksiyon/oy ve kişi
 * takibidir — kullanıcının sitede zaten yapabildiği, geri alınabilir işler. Yayınlama, silme, yorum yazma ve içerik değiştirme YOKTUR.
 *
 * Akış/koleksiyon satırı veritabanından yalnız KİMLİK + sıra olarak gelir; kartı doldurmak (başlık, yazar, küçük resim, "Çalıştı mı?") `prompts.ts`'in
 * ANON okumasıdır (`summariesByIds`) — yani akışta yalnız herkese açık prompt görünür, özel içerik hiçbir yoldan sızmaz.
 */
import { ME_LIMITS, TIME, type MeTx } from "./me.ts";
import { isUuid, summariesByIds, type PublicPromptSummary } from "./prompts.ts";
import { PublicApiError, type RestClient } from "./rest.ts";

export const REACTIONS = ["love", "fire", "wow", "clap", "haha", "idea"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const FEED_TABS = ["for_you", "following"] as const;
export type FeedTab = (typeof FEED_TABS)[number];
const CONTENT_TYPES = ["image", "text", "audio", "video"] as const;
export const ENGAGEMENT_MAX_IDS = 30;
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{2,40}$/;

function bad(message: string): never {
  throw new PublicApiError("bad_request", message);
}

function clampLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined) return ME_LIMITS.defaultLimit;
  if (!Number.isInteger(limit) || limit < 1 || limit > ME_LIMITS.maxLimit) bad(`limit must be an integer between 1 and ${ME_LIMITS.maxLimit}.`);
  return limit;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);

// ---------------------------------------------------------------------------------------------------------------------
// Akış
// ---------------------------------------------------------------------------------------------------------------------

/** İmleç: sıra anahtarı üçlüsü + (Sana özel için) oturum boyunca sabit "as_of" — sıralama kaymasın. Opak. */
interface FeedCursor {
  r: number;
  c: string;
  i: string;
  a: string | null;
}

function encodeFeedCursor(cursor: FeedCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeFeedCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const value = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as Partial<FeedCursor>;
    if (typeof value.r === "number" && Number.isFinite(value.r) && typeof value.c === "string" && !Number.isNaN(Date.parse(value.c)) && typeof value.i === "string" && isUuid(value.i)
      && (value.a === null || value.a === undefined || (typeof value.a === "string" && !Number.isNaN(Date.parse(value.a))))) {
      return { r: value.r, c: value.c, i: value.i, a: value.a ?? null };
    }
  } catch {
    // aşağıda tek hata
  }
  return bad("Invalid cursor.");
}

export interface MeFeedItem extends PublicPromptSummary {
  /** Sana özel'de gösterilme nedeni (en güçlü gerçek sinyal): `creator` takip ettiğin kişi · `tag`/`liked_tag` etiket (`ref`) · `tool` araç · `interest` ilgi alanı · `popular` kişisel sinyal yok. */
  reason: { kind: string; ref: string | null } | null;
}

export interface MeFeedPage {
  tab: FeedTab;
  items: MeFeedItem[];
  nextCursor: string | null;
}

export async function getMeFeed(
  tx: MeTx,
  client: RestClient,
  input: { tab?: string | null; contentType?: string | null; limit?: number | null; cursor?: string | null },
): Promise<MeFeedPage> {
  const tab = input.tab ?? "for_you";
  if (!(FEED_TABS as readonly string[]).includes(tab)) bad(`tab must be one of: ${FEED_TABS.join(", ")}.`);
  const contentType = input.contentType ? input.contentType : null;
  if (contentType !== null && !(CONTENT_TYPES as readonly string[]).includes(contentType)) bad(`content_type must be one of: ${CONTENT_TYPES.join(", ")}.`);
  const limit = clampLimit(input.limit);
  const after = decodeFeedCursor(input.cursor);
  const asOf = tab === "for_you" ? after?.a ?? new Date().toISOString() : null;
  const rows = await tx(
    `select r.id, r.sort_rank, r.reason_kind, r.reason_ref, to_char(r.created_at at time zone 'utc', ${TIME}) as created_cursor
       from public.api_me_feed($1, $2::timestamptz, $3, $4, $5::bigint, $6::timestamptz, $7::uuid) r`,
    [tab, asOf, contentType, limit, after ? after.r : null, after ? after.c : null, after ? after.i : null],
  );
  const last = rows[rows.length - 1];
  const summaries = await summariesByIds(client, rows.map((row) => String(row.id)));
  const reasons = new Map(rows.map((row) => [String(row.id), row.reason_kind ? { kind: String(row.reason_kind), ref: row.reason_ref ? String(row.reason_ref) : null } : null]));
  return {
    tab: tab as FeedTab,
    items: summaries.map((summary) => ({ ...summary, reason: reasons.get(summary.id) ?? null })),
    // İmleç HAM satırlardan kurulur: süzgeçte elenen satır olsa bile sonraki sayfa veritabanının döndürdüğü son satırdan devam eder.
    nextCursor: rows.length >= limit && last ? encodeFeedCursor({ r: num(last.sort_rank), c: String(last.created_cursor), i: String(last.id), a: asOf }) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Koleksiyonlar
// ---------------------------------------------------------------------------------------------------------------------

export interface MeCollection {
  id: string;
  name: string;
  visibility: string;
  /** Yalnız PROMPT sayısı (koleksiyonda başka içerik türleri de olabilir). */
  promptCount: number;
  shared: boolean;
  /** Sahibi benim mi (değilse ortağım). */
  mine: boolean;
  ownerUsername: string;
}

export async function listMyCollections(tx: MeTx): Promise<{ items: MeCollection[] }> {
  const rows = await tx("select * from public.api_me_collections()");
  return {
    items: rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      visibility: String(row.visibility ?? "private"),
      promptCount: num(row.prompt_count),
      shared: row.is_shared === true,
      mine: row.mine === true,
      ownerUsername: String(row.owner_username ?? ""),
    })),
  };
}

function encodeTimeCursor(time: string, id: string): string {
  return btoa(`${time}|${id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeTimeCursor(cursor: string | null | undefined): { time: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const [time, id] = raw.split("|");
    if (!time || !id || !isUuid(id) || Number.isNaN(Date.parse(time))) throw new Error("bad");
    return { time, id };
  } catch {
    return bad("Invalid cursor.");
  }
}

export async function listMyCollectionPrompts(
  tx: MeTx,
  client: RestClient,
  collectionId: string,
  input: { limit?: number | null; cursor?: string | null },
): Promise<{ items: PublicPromptSummary[]; nextCursor: string | null }> {
  if (!isUuid(collectionId)) bad("Collection id must be a UUID.");
  const limit = clampLimit(input.limit);
  const after = decodeTimeCursor(input.cursor);
  const rows = await tx(
    `select r.id, to_char(r.added_at at time zone 'utc', ${TIME}) as added_cursor
       from public.api_me_collection_prompts($1::uuid, $2, $3::timestamptz, $4::uuid) r`,
    [collectionId, limit + 1, after?.time ?? null, after?.id ?? null],
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: await summariesByIds(client, page.map((row) => String(row.id))),
    nextCursor: rows.length > limit && last ? encodeTimeCursor(String(last.added_cursor), String(last.id)) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Benim durumum
// ---------------------------------------------------------------------------------------------------------------------

export interface MeEngagement {
  /** Verdiğim tepki; yoksa null. */
  reaction: Reaction | null;
  saved: boolean;
  /** Bu promptu içeren koleksiyonlarım (sistem koleksiyonu hariç). */
  collectionIds: string[];
  authorUsername: string;
  followingAuthor: boolean;
  works: { yes: number; no: number; myVote: boolean | null; canVote: boolean };
}

/** Bir grup prompt için (en çok 30) benim durumum, kimliğe göre. Okunamayan/herkese açık olmayan prompt listede YOKTUR. */
export async function getMyEngagement(tx: MeTx, ids: string[]): Promise<{ items: Record<string, MeEngagement> }> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) bad("ids is required: a comma-separated list of prompt ids.");
  if (unique.length > ENGAGEMENT_MAX_IDS) bad(`At most ${ENGAGEMENT_MAX_IDS} ids.`);
  if (unique.some((id) => !isUuid(id))) bad("Every id must be a UUID.");
  const rows = await tx("select * from public.api_me_engagement($1::uuid[])", [`{${unique.join(",")}}`]);
  const items: Record<string, MeEngagement> = {};
  for (const row of rows) {
    const reaction = (REACTIONS as readonly unknown[]).includes(row.reaction) ? (row.reaction as Reaction) : null;
    items[String(row.prompt_id)] = {
      reaction,
      saved: row.saved === true,
      collectionIds: Array.isArray(row.collection_ids) ? row.collection_ids.map(String) : [],
      authorUsername: String(row.author_username ?? ""),
      followingAuthor: row.following_author === true,
      works: { yes: num(row.works_yes), no: num(row.works_no), myVote: typeof row.my_vote === "boolean" ? row.my_vote : null, canVote: row.can_vote === true },
    };
  }
  return { items };
}

// ---------------------------------------------------------------------------------------------------------------------
// Yazma (yalnız `interact` kapsamıyla çağrılır)
// ---------------------------------------------------------------------------------------------------------------------

function promptId(id: string): string {
  if (!isUuid(id)) bad("id must be a prompt UUID.");
  return id;
}

/** `reaction` null → geri al. */
export async function setMyReaction(tx: MeTx, id: string, reaction: unknown): Promise<{ reaction: Reaction | null }> {
  if (reaction !== null && !(REACTIONS as readonly unknown[]).includes(reaction)) bad(`reaction must be one of: ${REACTIONS.join(", ")}.`);
  const [row] = await tx("select public.api_me_react($1::uuid, $2) as reaction", [promptId(id), reaction]);
  return { reaction: (REACTIONS as readonly unknown[]).includes(row?.reaction) ? (row.reaction as Reaction) : null };
}

export async function setMySaved(tx: MeTx, id: string, saved: boolean): Promise<{ saved: boolean }> {
  const [row] = await tx("select public.api_me_set_saved($1::uuid, $2) as saved", [promptId(id), saved]);
  return { saved: row?.saved === true };
}

export async function setMyCollectionItem(tx: MeTx, collectionId: string, id: string, present: boolean): Promise<{ inCollection: boolean }> {
  if (!isUuid(collectionId)) bad("Collection id must be a UUID.");
  const [row] = await tx("select public.api_me_collection_item($1::uuid, $2::uuid, $3) as present", [collectionId, promptId(id), present]);
  return { inCollection: row?.present === true };
}

export async function setMyFollow(tx: MeTx, username: string, follow: boolean): Promise<{ following: boolean }> {
  if (!USERNAME_PATTERN.test(username)) bad("Invalid username.");
  const [row] = await tx("select public.api_me_set_follow($1, $2) as following", [username, follow]);
  return { following: row?.following === true };
}

/** "Çalıştı mı?" oyu: `works` true/false oy verir ya da değiştirir, null geri alır. Kural (kopyalamış olmak, yazar olmamak, engel) `set_prompt_works` RPC'sindedir. */
export async function setMyWorksVote(tx: MeTx, id: string, works: unknown): Promise<{ works: { yes: number; no: number; myVote: boolean | null } }> {
  if (works !== null && typeof works !== "boolean") bad("works must be true, false or null.");
  const [row] = await tx("select * from public.set_prompt_works($1::uuid, $2::boolean)", [promptId(id), works]);
  return { works: { yes: num(row?.yes_count), no: num(row?.no_count), myVote: typeof row?.my_vote === "boolean" ? row.my_vote : null } };
}
