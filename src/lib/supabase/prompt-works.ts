import { supabase } from "./client";
import { chunk } from "./paged";
import type { WorksState } from "@/lib/prompt-works";

/**
 * "Çalıştı mı?" oyu veri katmanı (docs/history/296-*): iki RPC. Sayılar ve "oy verebilir miyim" SUNUCUDA hesaplanır (`prompt_works_state`;
 * kopyalama geçmişi istemciye kapalıdır). Oyu yazan tek yol `set_prompt_works` (kopyalamış olmalı, yazar değil, engel yok, saatte 30).
 * Bilinen sunucu kodları (`copy_required`, `self_vote_not_allowed`, `interaction_blocked`, `rate_limit`) `server-errors.ts` ile çevrilmiş mesajla gelir.
 */

const n = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0);

function parseState(row: Record<string, unknown> | undefined): WorksState {
  return {
    yes: n(row?.yes_count),
    no: n(row?.no_count),
    myVote: typeof row?.my_vote === "boolean" ? row.my_vote : null,
    canVote: row?.can_vote === true,
  };
}

/** Bir promptun oy durumu; ağ/sunucu hatasında `null` (arayüz bloğu hiç göstermez — 0 yazan sahte sayı yalan olur). */
export async function fetchPromptWorks(promptId: string): Promise<WorksState | null> {
  try {
    const { data, error } = await supabase.rpc("prompt_works_state", { p_prompt_id: promptId });
    if (error) {
      console.error("fetchPromptWorks", error);
      return null;
    }
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return row ? parseState(row) : null;
  } catch (error) {
    console.error("fetchPromptWorks", error);
    return null;
  }
}

/**
 * Yorum yazarlarının / sonuç paylaşanların O PROMPTTAKİ oyu (rozet için; docs/history/341-*). Sunucu yalnız o promptun altında yorumu ya da sonucu
 * olan kişilerin oyunu döndürür (oy tablosu istemciye kapalı kalır), kimlikleri 100'erli parçalarla ister. Hata fırlatır — çağıran "bilinmiyor" sayıp
 * rozeti göstermez (yanlış rozet yazmaktansa rozetsiz kalmak doğrudur).
 */
export async function fetchWorksVotesForUsers(promptId: string, userIds: string[]): Promise<Map<string, boolean>> {
  const found = new Map<string, boolean>();
  const unique = [...new Set(userIds)];
  const pages = await Promise.all(
    chunk(unique, 100).map(async (ids) => {
      const { data, error } = await supabase.rpc("prompt_works_for_users", { p_prompt_id: promptId, p_user_ids: ids });
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as Array<{ user_id?: unknown; works?: unknown }>;
    }),
  );
  for (const rows of pages) {
    for (const row of rows) {
      if (typeof row.user_id === "string" && typeof row.works === "boolean") found.set(row.user_id, row.works);
    }
  }
  return found;
}

/** Oy ver / değiştir (`true`/`false`) ya da geri al (`null`). Hata `Error` olarak fırlar (mesaj kullanıcıya gösterilebilir). */
export async function setPromptWorks(promptId: string, works: boolean | null): Promise<WorksState> {
  const { data, error } = await supabase.rpc("set_prompt_works", { p_prompt_id: promptId, p_works: works });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  // Sunucu yeni sayıları ve oyumu döndürür; `can_vote` bu çağrıdan sonra da doğrudur (oy verebildiysem hâlâ verebilirim).
  return { ...parseState(row), canVote: true };
}

/**
 * Birden çok promptun "Çalıştı mı?" sayıları (Sana Özel'in "Öne çıkan" kartı, docs/history/451-*). `prompt_works_stats` okuma = o promptu
 * okuyabilen (RLS); oy tablosu kapalı kalır. Hata = boş (kart büyümez, akış bozulmaz).
 */
export async function fetchWorksStatsByIds(ids: string[]): Promise<Map<string, { yes: number; no: number }>> {
  const out = new Map<string, { yes: number; no: number }>();
  for (const part of chunk(ids, 100)) {
    const { data, error } = await supabase.from("prompt_works_stats").select("prompt_id, yes_count, no_count").in("prompt_id", part);
    if (error) continue;
    for (const row of (data ?? []) as { prompt_id: string; yes_count: number; no_count: number }[]) {
      out.set(row.prompt_id, { yes: row.yes_count, no: row.no_count });
    }
  }
  return out;
}

/** Bir promptun kullanıcı sonucu sayısı (öne çıkan kartta). */
export async function fetchResultCount(promptId: string): Promise<number | null> {
  const { count, error } = await supabase.from("prompt_results").select("id", { count: "exact", head: true }).eq("prompt_id", promptId);
  return error ? null : (count ?? 0);
}
