import { supabase } from "./client";
import { withoutBlocked } from "./blocked-users";
import { mapSkillRow, SKILL_LIST_SELECT, type SkillRow } from "./skills";
import { sanitizeSearchText, type ContentSearchFilters } from "./taxonomy-query";
import type { SearchCursor, SearchPage } from "./search";
import type { Skill, SkillCategory, SkillCompat, SkillLicense } from "@/types";

/**
 * Skill keşfi ve arama (docs/history/392-*): `skill_feed_page` (keyset, süzgeçler, sıralama), `related_skills`, `skills_for_content` RPC'leri.
 * RPC yalnız kimlik + sıra döner; kartlar bir sonraki TEK sorguda (`in id`) okunur ve RPC sırasında dizilir. Her kullanıcı metni RPC PARAMETRESİDİR
 * (filtre dizesine karıştırılmaz); sunucu LIKE joker karakterlerini kaçırır.
 */

export type SkillSort = "new" | "oldest" | "popular" | "most_used" | "recommended";

/** Eşleşmenin nerede bulunduğu (aramada kartın altındaki küçük not). */
export type SkillMatchSource = "title" | "summary" | "tag" | "tool" | "instructions";

export interface SkillFeedParams {
  query?: string;
  sort?: SkillSort;
  category?: SkillCategory | null;
  compat?: SkillCompat[];
  license?: SkillLicense | null;
  /** true = yalnız yayınlanmış paketi (ZIP) olanlar; false = paketsizler; undefined = hepsi. */
  hasPackage?: boolean;
  authorIds?: string[];
  tagSlugs?: string[];
}

export interface SkillFeedPage {
  items: Skill[];
  /** Skill kimliği → eşleşme kaynağı (yalnız metin aramasında dolu). */
  matchSources: Map<string, SkillMatchSource>;
  nextCursor: SearchCursor | null;
}

interface FeedRow {
  id: string;
  created_at: string;
  sort_rank: number | string;
  match_source: SkillMatchSource | null;
}

const PAGE = 24;

/** Kimlik listesini (RPC sırasıyla) kart satırlarına çevirir; okunamayan/silinen satır sessizce düşer, engelli yazarlar elenir. */
async function hydrate(ids: string[]): Promise<Skill[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("skills").select(SKILL_LIST_SELECT).in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map(((data ?? []) as unknown as SkillRow[]).map((row) => [row.id, mapSkillRow(row)]));
  const ordered = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return withoutBlocked(ordered, (skill) => skill.creator.id);
}

export async function fetchSkillFeedPage(params: SkillFeedParams, limit = PAGE, cursor?: SearchCursor | null): Promise<SkillFeedPage> {
  const text = sanitizeSearchText(params.query ?? "");
  const { data, error } = await supabase.rpc("skill_feed_page", {
    p_query: text || null,
    p_sort: params.sort ?? "new",
    p_category: params.category ?? null,
    p_compat: params.compat?.length ? params.compat : null,
    p_license: params.license ?? null,
    p_has_package: params.hasPackage ?? null,
    p_author_ids: params.authorIds?.length ? params.authorIds : null,
    p_tag_slugs: params.tagSlugs?.length ? params.tagSlugs : null,
    p_limit: limit,
    p_after_rank: cursor?.rank ?? null,
    p_after_created_at: cursor?.createdAt ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FeedRow[];
  const last = rows[rows.length - 1];
  const matchSources = new Map<string, SkillMatchSource>();
  for (const row of rows) if (row.match_source) matchSources.set(row.id, row.match_source);
  return {
    items: await hydrate(rows.map((row) => row.id)),
    matchSources,
    nextCursor: rows.length === limit && last ? { rank: Number(last.sort_rank), createdAt: last.created_at, id: last.id } : null,
  };
}

/** `/skills` aramasının (ContentListPage sözleşmesi) RPC karşılığı: sıralama ve yazar/etiket zinciri sitenin ortak arama çiplerinden gelir. */
export async function searchSkillsPage(query: string, filters: ContentSearchFilters = {}, limit = PAGE, cursor?: SearchCursor | null): Promise<SearchPage<Skill>> {
  const sort: SkillSort = filters.sort === "popular" ? "popular" : filters.sort === "oldest" ? "oldest" : "new";
  try {
    const page = await fetchSkillFeedPage(
      { query, sort, authorIds: [...(filters.authorIds ?? []), ...(filters.authorId ? [filters.authorId] : [])], tagSlugs: filters.tagSlugs },
      limit,
      cursor,
    );
    return { items: page.items, nextCursor: page.nextCursor };
  } catch (err) {
    console.error("searchSkillsPage", err);
    return { items: [], nextCursor: null };
  }
}

/** Benzer Skill'ler (aynı uzmanlık alanı, ortak etiket/araç, aynı yazar); hata ya da sinyal yoksa boş liste (bölüm hiç çizilmez). */
export async function fetchRelatedSkills(skillId: string, limit = 6): Promise<Skill[]> {
  const { data, error } = await supabase.rpc("related_skills", { p_skill: skillId, p_limit: limit });
  if (error) {
    console.error("fetchRelatedSkills", error);
    return [];
  }
  return hydrate(((data ?? []) as { id: string }[]).map((row) => row.id)).catch(() => []);
}

/** Ters yön: bir prompt / workflow / ayar paketine bağlı, yayınlanmış herkese açık Skill'ler ("Bu prompt şu Skill'lerde"). */
export async function fetchSkillsForContent(type: "prompt" | "workflow" | "preset", id: string, limit = 6): Promise<Skill[]> {
  const { data, error } = await supabase.rpc("skills_for_content", { p_type: type, p_id: id, p_limit: limit });
  if (error) {
    console.error("fetchSkillsForContent", error);
    return [];
  }
  return hydrate(((data ?? []) as { id: string }[]).map((row) => row.id)).catch(() => []);
}
