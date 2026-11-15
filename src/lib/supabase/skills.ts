import { supabase } from "./client";
import { withoutBlocked } from "./blocked-users";
import { applyKeysetCursor, nextCursorFrom, type KeysetCursor } from "./pagination";
import { PROFILE_SELECT } from "./profiles";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { sanitizeSearchText, type ContentSearchFilters } from "./taxonomy-query";
import type { SearchCursor, SearchPage } from "./search";
import { OWNED_PAGE, type PagedResult } from "./paged";
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
 * Basit metin araması (başlık, açıklama, talimat). Metin eşleşmesi tek `.or()` olduğundan sayfa imleci yalnız `created_at`'e bakar
 * (aynı anda eklenen satırlar nadiren atlanabilir). Kalıcı çözüm `search_content`'e `skill` türünü eklemektir (yapılacaklar listesi).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- süzgeçler Skill süzgeçleri diliminde (yapılacaklar listesi) kullanılacak
export async function searchSkillsPage(query: string, _filters: ContentSearchFilters = {}, limit = 20, cursor?: SearchCursor | null): Promise<SearchPage<Skill>> {
  try {
    const text = sanitizeSearchText(query);
    let request = supabase
      .from("skills")
      .select(SKILL_LIST_SELECT)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (text) request = request.or(`title.ilike.%${text}%,summary.ilike.%${text}%,instructions.ilike.%${text}%`);
    if (cursor) request = request.lt("created_at", cursor.createdAt);
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as SkillRow[];
    const items = await withoutBlocked(rows.map(mapSkillRow), (skill) => skill.creator.id);
    const last = rows[rows.length - 1];
    return { items, nextCursor: rows.length === limit && last ? { rank: 0, createdAt: last.created_at, id: last.id } : null };
  } catch (err) {
    console.error("searchSkillsPage", err);
    return { items: [], nextCursor: null };
  }
}

/**
 * Bir kişinin Skill'leri (profil bölümü, docs/history/390-*), sayfa sayfa (offset; toplam ilk sayfada). Ziyaretçiye yalnız yayında + herkese açık olanlar;
 * sahibinin kendi profilinde taslak ve özel olanlar da görünür (RLS zaten başkasınınkini vermez, süzgeç ikinci katmandır).
 */
export async function fetchSkillsByAuthorPage(authorId: string, isOwn: boolean, offset = 0, limit = OWNED_PAGE): Promise<PagedResult<Skill>> {
  let request = supabase
    .from("skills")
    .select(SKILL_LIST_SELECT, offset === 0 ? { count: "exact" } : undefined)
    .eq("author_id", authorId);
  if (!isOwn) request = request.eq("status", "published").eq("visibility", "public");
  const { data, count, error } = await request.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
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

  if (input.id) {
    const { data, error } = await supabase.from("skills").update(fields).eq("id", input.id).eq("author_id", userId).select("id").maybeSingle();
    if (error) throw new Error(error.message || translateForRuntime("skill.error.save"));
    if (!data) throw new Error(translateForRuntime("skill.error.notFound"));
    return input.id;
  }

  const base = slugifySkillName(fields.title) || "skill";
  const id = crypto.randomUUID();
  for (let attempt = 1; attempt <= 8; attempt += 1) {
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
