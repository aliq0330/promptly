import { supabase } from "./client";
import { chunk } from "./paged";
import { sanitizeSearchText } from "./taxonomy-query";
import type { CommentAttachment, CommentAttachmentType } from "@/types";

/**
 * Yorumdaki içerik ekinin küçük önizleme verisi (docs/history/307-*). Bir yorum sayfasındaki TÜM ekler tür başına TEK sorguyla okunur
 * (yorum başına ayrı istek yok); sorgu okuyucunun RLS'inden geçer, yani okuyamadığı içerik hiç dönmez. Dönen satır ayrıca "hâlâ halka açık mı"
 * diye süzülür: sahibi içeriği sonradan özel/taslak yapınca, sahibi dahil HERKES için kart "gizli veya kaldırılmış" olur.
 */
export interface AttachmentCard {
  type: CommentAttachmentType;
  id: string;
  title: string;
  ownerName: string | null;
  /** İlk görsel (prompt/istek/workflow/hazır ayar) ya da Space kapağı; yoksa tür simgesi çizilir. */
  thumbnailUrl: string | null;
  /** Yalnız istek: açık/kapalı rozeti. */
  requestStatus?: "open" | "answered" | "closed";
  /** Yalnız workflow: adım sayısı. */
  stepCount?: number;
}

export const attachmentKey = (item: CommentAttachment) => `${item.type}:${item.id}`;

type ProfileEmbed = { display_name: string | null } | { display_name: string | null }[] | null;
const ownerOf = (profiles: ProfileEmbed): string | null => (Array.isArray(profiles) ? profiles[0]?.display_name : profiles?.display_name) ?? null;
const firstMedia = (media: { url: string; position: number }[] | null | undefined): string | null =>
  [...(media ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null;

async function fetchRows<T>(table: string, select: string, ids: string[]): Promise<T[]> {
  const pages = await Promise.all(
    chunk(ids, 100).map(async (part) => {
      const { data, error } = await supabase.from(table).select(select).in("id", part);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as T[];
    }),
  );
  return pages.flat();
}

interface PromptCardRow { id: string; title: string; status: string; visibility: string; community_id: string | null; deleted_at: string | null; profiles: ProfileEmbed; prompt_media: { url: string; position: number }[] | null }
interface RequestCardRow { id: string; title: string; status: "open" | "answered" | "closed"; is_draft: boolean; visibility: string; community_id: string | null; deleted_at: string | null; profiles: ProfileEmbed; prompt_request_media: { url: string; position: number }[] | null }
interface WorkflowCardRow { id: string; title: string; cover_url: string | null; status: string; visibility: string; community_id: string | null; profiles: ProfileEmbed; workflow_steps: { count: number }[] | null; workflow_media: { url: string; position: number }[] | null }
interface PresetCardRow { id: string; title: string; cover_url: string | null; status: string; visibility: string; community_id: string | null; profiles: ProfileEmbed }
interface SpaceCardRow { id: string; owner_id: string; title: string; cover_url: string | null; visibility: string; archived_at: string | null }

/**
 * Verilen eklerin kartları; anahtar `tür:kimlik`. Okunamayan / halka açık olmayan / silinmiş içerik haritada YOKTUR (arayüz "gizli veya
 * kaldırılmış" kartını çizer). Bir tür başarısız olursa `failed`'e yazılır (arayüz "yüklenemedi" der, "gizli" demez), diğer türler gelir.
 */
export async function fetchAttachmentCards(items: CommentAttachment[]): Promise<{ cards: Map<string, AttachmentCard>; failed: Set<CommentAttachmentType> }> {
  const byType = new Map<CommentAttachmentType, string[]>();
  for (const item of items) {
    const list = byType.get(item.type) ?? [];
    if (!list.includes(item.id)) list.push(item.id);
    byType.set(item.type, list);
  }
  const cards = new Map<string, AttachmentCard>();
  const failed = new Set<CommentAttachmentType>();
  const put = (card: AttachmentCard) => cards.set(attachmentKey(card), card);

  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      try {
        if (type === "prompt") {
          const rows = await fetchRows<PromptCardRow>("prompts", "id, title, status, visibility, community_id, deleted_at, profiles:author_id ( display_name ), prompt_media ( url, position )", ids);
          for (const row of rows) {
            if (row.status !== "published" || row.visibility !== "public" || row.community_id || row.deleted_at) continue;
            put({ type, id: row.id, title: row.title, ownerName: ownerOf(row.profiles), thumbnailUrl: firstMedia(row.prompt_media) });
          }
        } else if (type === "request") {
          const rows = await fetchRows<RequestCardRow>("prompt_requests", "id, title, status, is_draft, visibility, community_id, deleted_at, profiles:author_id ( display_name ), prompt_request_media ( url, position )", ids);
          for (const row of rows) {
            if (row.is_draft || row.visibility !== "public" || row.community_id || row.deleted_at) continue;
            put({ type, id: row.id, title: row.title, ownerName: ownerOf(row.profiles), thumbnailUrl: firstMedia(row.prompt_request_media), requestStatus: row.status });
          }
        } else if (type === "workflow") {
          const rows = await fetchRows<WorkflowCardRow>("workflows", "id, title, cover_url, status, visibility, community_id, profiles:creator_id ( display_name ), workflow_steps ( count ), workflow_media ( url, position )", ids);
          for (const row of rows) {
            if (row.status !== "published" || row.visibility !== "public" || row.community_id) continue;
            put({ type, id: row.id, title: row.title, ownerName: ownerOf(row.profiles), thumbnailUrl: firstMedia(row.workflow_media) ?? row.cover_url, stepCount: row.workflow_steps?.[0]?.count ?? 0 });
          }
        } else if (type === "preset") {
          const rows = await fetchRows<PresetCardRow>("presets", "id, title, cover_url, status, visibility, community_id, profiles:creator_id ( display_name )", ids);
          for (const row of rows) {
            if (row.status !== "published" || row.visibility !== "public" || row.community_id) continue;
            put({ type, id: row.id, title: row.title, ownerName: ownerOf(row.profiles), thumbnailUrl: row.cover_url });
          }
        } else {
          const rows = await fetchRows<SpaceCardRow>("spaces", "id, owner_id, title, cover_url, visibility, archived_at", ids);
          const visible = rows.filter((row) => row.visibility === "public" && !row.archived_at);
          const owners = new Map<string, string | null>();
          const ownerIds = [...new Set(visible.map((row) => row.owner_id))];
          for (const part of chunk(ownerIds, 100)) {
            const { data } = await supabase.from("profiles").select("id, display_name").in("id", part);
            for (const profile of (data ?? []) as { id: string; display_name: string | null }[]) owners.set(profile.id, profile.display_name);
          }
          for (const row of visible) put({ type, id: row.id, title: row.title, ownerName: owners.get(row.owner_id) ?? null, thumbnailUrl: row.cover_url });
        }
      } catch (err) {
        console.error("fetchAttachmentCards", type, err);
        failed.add(type);
      }
    }),
  );
  return { cards, failed };
}

// ---------------------------------------------------------------------------------------------
// İçerik seçici: "Kaydettiklerim" kaynağı
// ---------------------------------------------------------------------------------------------


/** Kaydedilebilen türler (istek ve Space kaydedilmez — docs/history/184-*): "Kaydettiklerim" yalnız bunlarda vardır. */
export const SAVED_SOURCE_TYPES: readonly CommentAttachmentType[] = ["prompt", "workflow", "preset"];

export interface PickableContent {
  id: string;
  type: CommentAttachmentType;
  title: string;
}

/**
 * Kullanıcının kendi koleksiyonlarındaki herkese açık, yayında içerikler (başkasınınki de olabilir): yoruma eklenebilirliğin sunucu kuralıyla aynı
 * süzgeç sorguda uygulanır; aynı içerik birkaç koleksiyondaysa tek satır sayılır. `limit` satırlık pencere + "daha var mı".
 */
export async function fetchSavedPickableWindow(
  userId: string,
  type: "prompt" | "workflow" | "preset",
  { search = "", limit = 30 }: { search?: string; limit?: number } = {},
): Promise<{ items: PickableContent[]; hasMore: boolean }> {
  const table = type === "prompt" ? "prompts" : type === "workflow" ? "workflows" : "presets";
  const text = sanitizeSearchText(search);
  let query = supabase
    .from("collection_items")
    .select(`created_at, collections!inner ( owner_id ), ${table}!inner ( id, title )`)
    .eq("collections.owner_id", userId)
    .eq(`${table}.visibility`, "public")
    .eq(`${table}.status`, "published")
    .is(`${table}.community_id`, null);
  if (type === "prompt") query = query.is("prompts.deleted_at", null);
  if (text) query = query.ilike(`${table}.title`, `%${text}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, { id: string; title: string } | null>[];
  const seen = new Set<string>();
  const items: PickableContent[] = [];
  for (const row of rows.slice(0, limit)) {
    const content = row[table];
    if (!content || seen.has(content.id)) continue;
    seen.add(content.id);
    items.push({ id: content.id, type, title: content.title });
  }
  return { items, hasMore: rows.length > limit };
}
