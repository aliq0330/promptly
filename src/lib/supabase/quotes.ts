import { supabase } from "./client";
import { fetchPromptsByIds } from "./prompts";
import { fetchRequestsByIds } from "./requests";
import { fetchWorkflowsByIds } from "./workflows";
import { fetchPresetsByIds } from "./presets";
import { fetchSpaceFeedCards } from "./spaces";
import { translateForRuntime, type TranslationKey } from "@/lib/i18n/translations";
import type { CommunityPostContent, CommunityPostType } from "./communities";
import type { UserProfile } from "@/types";

/** Alıntı notu sınırı (sunucu: `content_quotes_note_len`). */
export const QUOTE_NOTE_MAX = 500;

/**
 * Bir içeriğin ALINTISI (docs/history/217-*): alıntılayanın notu + alıntılanan içerik. Kendi kimliği, beğenisi ve yorumları vardır
 * (`prompt_likes.quote_id` / `prompt_comments.quote_id`); alıntılanan içeriğin sayaçlarına karışmaz. İçerik artık okunamıyorsa (özel yapıldı,
 * silindi) sunucu alıntıyı hiç döndürmez — `content` boş kalması yalnız ikinci istek arasında kaybolan içerik içindir.
 */
export interface Quote {
  id: string;
  author: UserProfile;
  contentType: CommunityPostType;
  targetId: string;
  content: CommunityPostContent | null;
  note: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  isLiked: boolean;
}

interface QuoteCardRow {
  id: string;
  author_id: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  content_type: CommunityPostType;
  target_id: string;
  note: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  is_liked: boolean;
}

/** Sunucunun `create_quote` hata kodları → kullanıcıya görünen metin. */
const ERROR_KEYS: Record<string, TranslationKey> = {
  not_authenticated: "quotes.error.notAuthenticated",
  forbidden: "quotes.error.forbidden",
  invalid_content: "quotes.error.invalidContent",
  invalid_note: "quotes.error.invalidNote",
  content_not_found: "quotes.error.notFound",
  content_not_public: "quotes.error.notPublic",
  blocked: "quotes.error.blocked",
  already_quoted: "quotes.error.alreadyQuoted",
  quote_rate_limit: "quotes.error.rateLimit",
};

export function toQuoteError(error: { message?: string } | null): Error {
  const message = error?.message ?? "";
  const code = Object.keys(ERROR_KEYS).find((key) => message.includes(key));
  return new Error(translateForRuntime(code ? ERROR_KEYS[code] : "common.actionFailedRetry"));
}

function mapAuthor(row: QuoteCardRow): UserProfile {
  return {
    id: row.author_id,
    username: row.author_username ?? "",
    displayName: row.author_display_name ?? row.author_username ?? "",
    avatarUrl: row.author_avatar_url,
    coverUrl: null,
    bio: null,
    website: null,
    followerCount: 0,
    followingCount: 0,
    createdAt: row.created_at,
  };
}

/**
 * Kimliklerden alıntılar: kart satırları (`quote_feed_cards`, RLS'li) + alıntılanan içerikler (listelerin kullandığı aynı seçimler). Okunamayan
 * alıntı hiç dönmez; içeriği ikinci istekte kaybolmuşsa (silindi/özel yapıldı) atlanır. Sıra `ids`'in sırasıdır.
 */
export async function fetchQuotesByIds(ids: string[]): Promise<Quote[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("quote_feed_cards", { p_ids: ids });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as QuoteCardRow[];
  const idsOf = (type: CommunityPostType) => [...new Set(rows.filter((row) => row.content_type === type).map((row) => row.target_id))];
  const [prompts, requests, workflows, presets, spaces] = await Promise.all([
    fetchPromptsByIds(idsOf("prompt")),
    fetchRequestsByIds(idsOf("request")),
    fetchWorkflowsByIds(idsOf("workflow")),
    fetchPresetsByIds(idsOf("preset")),
    fetchSpaceFeedCards(idsOf("space")).catch(() => []),
  ]);
  const content = new Map<string, CommunityPostContent>();
  for (const data of prompts) content.set(`prompt-${data.id}`, { type: "prompt", data });
  for (const data of requests) content.set(`request-${data.id}`, { type: "request", data });
  for (const data of workflows) content.set(`workflow-${data.id}`, { type: "workflow", data });
  for (const data of presets) content.set(`preset-${data.id}`, { type: "preset", data });
  for (const data of spaces) content.set(`space-${data.id}`, { type: "space", data });

  const byId = new Map<string, Quote>();
  for (const row of rows) {
    const target = content.get(`${row.content_type}-${row.target_id}`) ?? null;
    if (!target) continue;
    byId.set(row.id, {
      id: row.id,
      author: mapAuthor(row),
      contentType: row.content_type,
      targetId: row.target_id,
      content: target,
      note: row.note,
      likeCount: row.like_count ?? 0,
      commentCount: row.comment_count ?? 0,
      createdAt: row.created_at,
      isLiked: Boolean(row.is_liked),
    });
  }
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function fetchQuoteById(id: string): Promise<Quote | null> {
  return (await fetchQuotesByIds([id]))[0] ?? null;
}

/** İçeriği alıntılar (tek yazma yolu `create_quote`; kurallar sunucuda). Başarısızlıkta nedeni yazan bir hata fırlatır. */
export async function createQuote(type: CommunityPostType, contentId: string, note: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_quote", { p_content_type: type, p_content_id: contentId, p_note: note.trim() || null });
  if (error) throw toQuoteError(error);
  return String(data);
}

/** Kendi alıntını siler; "0 satır etkilendi" sessiz başarı sayılmaz. */
export async function deleteQuote(id: string): Promise<void> {
  const { data, error } = await supabase.from("content_quotes").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw toQuoteError(error);
  if (!data) throw toQuoteError(null);
}

export interface QuoteCursor {
  createdAt: string;
  id: string;
}

export const QUOTE_PAGE_SIZE = 12;

interface IdRow {
  id: string;
  created_at: string;
}

async function pageOf(rows: IdRow[], limit: number): Promise<{ quotes: Quote[]; nextCursor: QuoteCursor | null }> {
  const quotes = await fetchQuotesByIds(rows.map((row) => row.id));
  const last = rows[rows.length - 1];
  return { quotes, nextCursor: rows.length >= limit && last ? { createdAt: last.created_at, id: last.id } : null };
}

/** Profildeki "Alıntılar" sekmesi: kişinin alıntıları, yeniden eskiye (keyset); yalnız okunabilenler. */
export async function fetchProfileQuotes(authorId: string, cursor: QuoteCursor | null, limit = QUOTE_PAGE_SIZE) {
  const { data, error } = await supabase.rpc("profile_quotes_page", {
    p_author: authorId,
    p_limit: limit,
    p_after_created_at: cursor?.createdAt ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (error) throw new Error(error.message);
  return pageOf((data ?? []) as IdRow[], limit);
}

export async function fetchProfileQuoteCount(authorId: string): Promise<number> {
  const { data, error } = await supabase.rpc("profile_quote_count", { p_author: authorId });
  if (error) return 0;
  return Number(data ?? 0);
}

/** Arama: alıntının notu ya da alıntılanan içeriğin başlığı eşleşir. */
export async function searchQuotes(query: string, cursor: QuoteCursor | null, limit = QUOTE_PAGE_SIZE) {
  const { data, error } = await supabase.rpc("search_quotes", {
    p_query: query,
    p_limit: limit,
    p_after_created_at: cursor?.createdAt ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (error) throw new Error(error.message);
  return pageOf((data ?? []) as IdRow[], limit);
}
