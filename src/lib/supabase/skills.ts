import { supabase } from "./client";
import { withoutBlocked } from "./blocked-users";
import { applyKeysetCursor, nextCursorFrom, type KeysetCursor } from "./pagination";
import { PROFILE_SELECT } from "./profiles";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { sanitizeSearchText } from "./taxonomy-query";
import { OWNED_PAGE, type OwnedListFilter, type PagedResult } from "./paged";
import { translateForRuntime } from "@/lib/i18n/runtime";
import { isValidSkillSlug, slugifySkillName, withSlugSuffix } from "@/lib/skills/skill-md";
import type { Skill, SkillCategory, SkillCompat, SkillLicense } from "@/types";

/**
 * Skill veri erişimi (docs/history/388-*, çekirdek dilim): okuma + sahibin kendi yazması. Beğeni/yorum/kaydet, arama RPC'si,
 * dosya ve sürüm tabloları sonraki dilimlerdir (`docs/yapilacaklar.md`). Her yazma RLS'ten geçer; istemci tek koruma değildir.
 */
export interface SkillRow {
  id: string;
  author_id: string;
  slug: string;
  title: string;
  summary: string;
  /** Liste sorgularında seçilmez (60 000 karakterlik metin kartta gerekmez). */
  instructions?: string | null;
  category: SkillCategory | null;
  compat: SkillCompat[] | null;
  license: SkillLicense;
  version: string;
  status: "draft" | "published";
  visibility: "public" | "private";
  use_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
}

const SKILL_LIST_COLUMNS = "id, author_id, slug, title, summary, category, compat, license, version, status, visibility, use_count, like_count, comment_count, save_count, created_at, updated_at";
export const SKILL_LIST_SELECT = `${SKILL_LIST_COLUMNS}, profiles:author_id ( ${PROFILE_SELECT} )`;
export const SKILL_DETAIL_SELECT = `${SKILL_LIST_COLUMNS}, instructions, profiles:author_id ( ${PROFILE_SELECT} )`;

export function mapSkillRow(row: SkillRow): Skill {
  return {
    id: row.id,
    creator: mapProfileRow(row.profiles),
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    instructions: row.instructions ?? "",
    category: row.category,
    compat: row.compat ?? [],
    license: row.license,
    version: row.version,
    status: row.status,
    visibility: row.visibility,
    useCount: row.use_count ?? 0,
    likeCount: row.like_count ?? 0,
    commentCount: row.comment_count ?? 0,
    saveCount: row.save_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SkillsPage {
  items: Skill[];
  nextCursor: KeysetCursor | null;
}

/** Yayınlanmış, herkese açık Skill'ler, en yeni önce (keyset). `/skills` listesinin kaynağı. */
export async function fetchRecentSkills(limit = 24, cursor?: KeysetCursor): Promise<SkillsPage> {
  try {
    const request = applyKeysetCursor(
      supabase
        .from("skills")
        .select(SKILL_LIST_SELECT)
        .eq("status", "published")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
      "created_at",
      cursor,
    );
    const { data, error } = await request;
    if (error) {
      console.error("fetchRecentSkills", error);
      return { items: [], nextCursor: null };
    }
    const rows = (data ?? []) as unknown as SkillRow[];
    return { items: await withoutBlocked(rows.map(mapSkillRow), (skill) => skill.creator.id), nextCursor: nextCursorFrom(rows, limit, (row) => row.created_at) };
  } catch (err) {
    console.error("fetchRecentSkills", err);
    return { items: [], nextCursor: null };
  }
}

/**
 * Bir kişinin Skill'leri (profil bölümü, docs/history/390-*), sayfa sayfa (offset; toplam ilk sayfada). Ziyaretçiye yalnız yayında + herkese açık olanlar;
 * sahibinin kendi profilinde taslak ve özel olanlar da görünür (RLS zaten başkasınınkini vermez, süzgeç ikinci katmandır).
 */
export async function fetchSkillsByAuthorPage(authorId: string, isOwn: boolean, offset = 0, limit = OWNED_PAGE, filter: OwnedListFilter = {}): Promise<PagedResult<Skill>> {
  let request = supabase
    .from("skills")
    .select(SKILL_LIST_SELECT, offset === 0 ? { count: "exact" } : undefined)
    .eq("author_id", authorId);
  if (!isOwn) request = request.eq("status", "published").eq("visibility", "public");
  else if (filter.visibility && filter.visibility !== "all") request = request.eq("visibility", filter.visibility);
  const text = sanitizeSearchText(filter.search ?? "");
  if (text) request = request.or(`title.ilike.%${text}%,summary.ilike.%${text}%`);
  const sort = filter.sort ?? "newest";
  request = sort === "most-liked" ? request.order("like_count", { ascending: false }).order("created_at", { ascending: false }) : request.order("created_at", { ascending: sort === "oldest" });
  const { data, count, error } = await request.order("id", { ascending: sort === "oldest" }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as SkillRow[];
  return { items: rows.map(mapSkillRow), total: offset === 0 ? (count ?? null) : null, nextOffset: rows.length === limit ? offset + limit : null };
}

/** Profil menüsündeki sayı: ziyaretçiye yayında + herkese açık, sahibine hepsi. Hata = 0 (bölüm gizli kalır). */
export async function fetchProfileSkillCount(authorId: string, isOwn: boolean): Promise<number> {
  let request = supabase.from("skills").select("id", { count: "exact", head: true }).eq("author_id", authorId);
  if (!isOwn) request = request.eq("status", "published").eq("visibility", "public");
  const { count, error } = await request;
  return error ? 0 : (count ?? 0);
}

/** Tek Skill (talimat dahil); yok ya da görünmüyorsa (RLS) `null`. */
export async function fetchSkillById(id: string): Promise<Skill | null> {
  try {
    const { data, error } = await supabase.from("skills").select(SKILL_DETAIL_SELECT).eq("id", id).maybeSingle();
    if (error || !data) {
      if (error) console.error("fetchSkillById", error);
      return null;
    }
    return mapSkillRow(data as unknown as SkillRow);
  } catch (err) {
    console.error("fetchSkillById", err);
    return null;
  }
}

/** Sohbette "kütüphaneden paylaş" için: kendi yayında + herkese açık Skill'ler (alıcının okuyamayacağı taslak/özel listelenmez); başlık araması + `limit` satırlık pencere. */
export async function fetchOwnShareableSkillsWindow(userId: string, { search = "", limit = 30 }: { search?: string; limit?: number } = {}): Promise<{ items: { id: string; type: "skill"; title: string }[]; hasMore: boolean }> {
  const text = sanitizeSearchText(search);
  let query = supabase.from("skills").select("id, title").eq("author_id", userId).eq("status", "published").eq("visibility", "public");
  if (text) query = query.ilike("title", `%${text}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; title: string }[];
  return { items: rows.slice(0, limit).map((row) => ({ id: row.id, type: "skill" as const, title: row.title })), hasMore: rows.length > limit };
}

/** Kimliklerden Skill kartları (alıntı kartı için); okunamayanlar (RLS) dönmez. Sıra `ids`'in sırasıdır. */
export async function fetchSkillsByIds(ids: string[]): Promise<Skill[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("skills").select(SKILL_LIST_SELECT).in("id", ids);
  if (error || !data) {
    if (error) console.error("fetchSkillsByIds", error);
    return [];
  }
  const byId = new Map((data as unknown as SkillRow[]).map((row) => [row.id, mapSkillRow(row)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export interface SaveSkillInput {
  /** Düzenlemede mevcut kimlik, yeni Skill için `null`. */
  id: string | null;
  title: string;
  summary: string;
  instructions: string;
  category: SkillCategory | null;
  compat: SkillCompat[];
  license: SkillLicense;
  version: string;
  status: "draft" | "published";
  visibility: "public" | "private";
  /** Verilirse (düzenlemede de) klasör adı olarak yazılır; verilmezse yeni Skill'de addan türetilir, düzenlemede değişmez. Geçerli biçim `isValidSkillSlug`. */
  slug?: string | null;
}

/** Aynı yazarda aynı `slug` varsa Postgres `unique violation` (23505) verir. */
function isSlugConflict(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" && /skills_author_id_slug_key|slug/i.test(error.message ?? "");
}

/**
 * Skill kaydeder ve kimliğini döndürür. Yeni Skill'in `slug`'ı addan türetilir (`senior-frontend-developer`), çakışırsa `-2`, `-3` … denenir;
 * düzenlemede `slug` DEĞİŞMEZ (klasör adı kararlı kalır). Hata iletisi çevrilmiştir.
 */
export async function saveSkill(input: SaveSkillInput, userId: string): Promise<string> {
  const fields = {
    title: input.title.trim(),
    summary: input.summary.trim(),
    instructions: input.instructions,
    category: input.category,
    compat: input.compat,
    license: input.license,
    version: input.version.trim(),
    status: input.status,
    visibility: input.visibility,
  };
  const wantedSlug = input.slug?.trim() || null;
  if (wantedSlug && !isValidSkillSlug(wantedSlug)) throw new Error(translateForRuntime("skill.error.slug"));

  if (input.id) {
    const { data, error } = await supabase.from("skills").update(wantedSlug ? { ...fields, slug: wantedSlug } : fields).eq("id", input.id).eq("author_id", userId).select("id").maybeSingle();
    if (error) {
      if (wantedSlug && isSlugConflict(error)) throw new Error(translateForRuntime("skill.error.slug"));
      throw new Error(error.message || translateForRuntime("skill.error.save"));
    }
    if (!data) throw new Error(translateForRuntime("skill.error.notFound"));
    return input.id;
  }

  const base = wantedSlug ?? (slugifySkillName(fields.title) || "skill");
  const id = crypto.randomUUID();
  for (let attempt = 1; attempt <= (wantedSlug ? 1 : 8); attempt += 1) {
    const slug = withSlugSuffix(base, attempt);
    if (!isValidSkillSlug(slug)) break;
    const { error } = await supabase.from("skills").insert({ id, author_id: userId, slug, ...fields });
    if (!error) return id;
    if (!isSlugConflict(error)) throw new Error(error.message || translateForRuntime("skill.error.save"));
  }
  throw new Error(translateForRuntime("skill.error.slug"));
}

/** Sahibin kendi Skill'ini siler; satır yoksa ya da başkasınınsa hata (sessiz başarı sayılmaz). */
export async function deleteSkill(id: string, userId: string): Promise<void> {
  const { data, error } = await supabase.from("skills").delete().eq("id", id).eq("author_id", userId).select("id");
  if (error) throw new Error(error.message || translateForRuntime("skill.error.delete"));
  if (!data || data.length === 0) throw new Error(translateForRuntime("skill.error.notFound"));
}

/** Skill'in etiketleri (`skill_tags` ⋈ `tags`); okuma Skill'in görünürlüğünü izler. */
export async function fetchSkillTags(skillId: string): Promise<{ slug: string; label: string }[]> {
  const { data, error } = await supabase.from("skill_tags").select("tags ( slug, label )").eq("skill_id", skillId).limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { tags: { slug: string; label: string } | null }[]).flatMap((row) => (row.tags ? [row.tags] : []));
}

/** Etiket kümesini değiştirir (sahibi; ≤ 10 sunucuda zorlanır). Önce silinir sonra eklenir: kısmi hata etiketi eksik bırakır, fazla etiket bırakmaz. */
export async function replaceSkillTags(skillId: string, slugs: string[]): Promise<void> {
  const unique = [...new Set(slugs)];
  const { error: deleteError } = await supabase.from("skill_tags").delete().eq("skill_id", skillId);
  if (deleteError) throw new Error(deleteError.message);
  if (unique.length === 0) return;
  const { error } = await supabase.from("skill_tags").insert(unique.map((tagSlug) => ({ skill_id: skillId, tag_slug: tagSlug })));
  if (error) throw new Error(error.message);
}
