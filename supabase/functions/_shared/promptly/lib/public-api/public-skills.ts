/**
 * Açık API çekirdeği — herkese açık SKILL arama + okuma (docs/history/393-*). `public-content.ts` ile aynı ilkeler: yalnız ANON anahtar (sitenin oturumsuz
 * ziyaretçisinin yetkisi), yalnız yayında + herkese açık Skill, her liste sınırlı. Arama sitenin kendi `skill_feed_page` RPC'sidir (SECURITY INVOKER, RLS
 * atlanmaz); yeni SQL yok.
 *
 * Skill içeriği KULLANICI içeriğidir: veri, talimat değil — MCP katmanı yanıtı "güvenilmeyen veri" notuyla sarar. `instructions` Skill'in SKILL.md gövdesidir;
 * paket dosyalarının GÖVDESİ burada yoktur (özel `skill-files` bucket'ı; yalnız dosya listesi/boyutu/türü), betik olarak işaretli dosyalar `script: true` ile
 * belirtilir ve HİÇBİR YERDE çalıştırılmaz. Her kayıt `url` (paylaşım sayfası) ve yazar adı taşır — atıf Kullanım Koşulları'ndaki gibidir.
 */
import { sharePathFor } from "../share-link.ts";
import { PUBLIC_LIMITS, SLUG_PATTERN, bad, clampLimit, decodeCursor, encodeCursor, isUuid, oneOf, slugList, type Page, type PublicAuthor, type SearchParams } from "./prompts.ts";
import { normalizeTagLabel } from "../tag-normalize.ts";
import { PublicApiError, type RestClient } from "./rest.ts";

export const PUBLIC_SKILL_SORTS = ["new", "oldest", "popular", "most_used", "recommended"] as const;
export type PublicSkillSort = (typeof PUBLIC_SKILL_SORTS)[number];
/** Veritabanı CHECK'leriyle aynı değerler (`skills_category_check`, `skills_compat_check`, `skills_license_check`). */
export const PUBLIC_SKILL_CATEGORIES = ["software", "design", "research", "business", "marketing", "education", "data", "productivity"] as const;
export const PUBLIC_SKILL_COMPAT = ["claude-code", "codex", "cursor", "other"] as const;
export const PUBLIC_SKILL_LICENSES = ["mit", "apache-2.0", "cc0-1.0", "cc-by-4.0", "cc-by-sa-4.0", "proprietary"] as const;

export interface PublicSkillSummary {
  id: string;
  url: string;
  title: string;
  description: string;
  category: string | null;
  compat: string[];
  license: string;
  version: string;
  tags: string[];
  author: PublicAuthor;
  stats: { likes: number; saves: number; comments: number; uses: number };
  createdAt: string;
  /** Aramada eşleşmenin bulunduğu yer (`title` · `summary` · `tag` · `tool` · `instructions`); metinsiz listede yok. */
  matchedIn?: string;
}

export interface PublicSkillFile {
  path: string;
  kind: string;
  size: number;
  /** Betik olarak işaretlenmiş dosya: Promptly onu ASLA çalıştırmaz; kullanmadan önce kendin oku. */
  script: boolean;
}

export interface PublicSkillVersion {
  version: string;
  changelog: string;
  fileCount: number;
  packageSize: number;
  createdAt: string;
  deprecated: boolean;
}

export type PublicSkill = PublicSkillSummary & {
  /**
   * SKILL.md gövdesi (Markdown). Skill'in YAYINLANMIŞ bir sürümü varsa o sürümün yayın anındaki, DEĞİŞMEZ metnidir (`instructionsSource: "published"`); sahip çalışma kopyasını
   * sonradan değiştirse de burası değişmez. Sürümde anlık görüntü yoksa (bu özellikten önceki sürüm ya da hiç sürüm yok) çalışma kopyasıdır (`"working_copy"`).
   */
  instructions: string;
  instructionsSource: "published" | "working_copy";
  /** Yayınlanmış anlık görüntü var ve sahibin çalışma kopyası ondan farklı: değişiklik henüz yeni bir sürümle yayınlanmadı (okuyucu yine yayınlanmış metni görür). */
  hasUnpublishedChanges: boolean;
  /** Yayınlanmış en son sürüm (paketi yoksa `null`: Skill yalnız SKILL.md'den ibarettir). */
  latestVersion: PublicSkillVersion | null;
  /** O sürümün dosya listesi (gövde değil). */
  files: PublicSkillFile[];
  /** Bağlı herkese açık içerik (yalnız bağlantı; prompt metni yok). */
  related: { type: string; id: string; url: string }[];
};

interface SkillRow {
  id: string;
  title: string;
  summary: string | null;
  instructions?: string | null;
  category: string | null;
  compat: string[] | null;
  license: string;
  version: string;
  like_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  use_count: number | null;
  created_at: string;
  profiles: { username: string; display_name: string | null } | null;
  skill_tags: { tag_slug: string }[] | null;
}
interface VersionRow {
  version: string;
  instructions?: string | null;
  changelog: string | null;
  package_size: number | null;
  file_count: number | null;
  manifest: { files?: { path?: unknown; kind?: unknown; size?: unknown; script?: unknown }[] } | null;
  created_at: string;
  deprecated_at: string | null;
}

const LIST_COLUMNS = "id,title,summary,category,compat,license,version,like_count,comment_count,save_count,use_count,created_at,profiles:author_id(username,display_name),skill_tags(tag_slug)";
const DETAIL_COLUMNS = `${LIST_COLUMNS},instructions`;
const trimTo = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Herkese açık okuma süzgeci (RLS anon'a zaten yalnız bunu verir; süzgeç niyeti belgeler, yetkiyi genişletmez). */
function publicFilters(params: URLSearchParams): URLSearchParams {
  params.set("status", "eq.published");
  params.set("visibility", "eq.public");
  return params;
}

function summaryOf(row: SkillRow, siteUrl: string): PublicSkillSummary {
  return {
    id: row.id,
    url: `${siteUrl}${sharePathFor("skill", row.id)}`,
    title: row.title,
    description: trimTo((row.summary ?? "").trim(), PUBLIC_LIMITS.descriptionChars),
    category: row.category,
    compat: row.compat ?? [],
    license: row.license,
    version: row.version,
    tags: (row.skill_tags ?? []).map((tag) => tag.tag_slug),
    author: { username: row.profiles?.username ?? "unknown", displayName: row.profiles?.display_name ?? null },
    stats: { likes: row.like_count ?? 0, saves: row.save_count ?? 0, comments: row.comment_count ?? 0, uses: row.use_count ?? 0 },
    createdAt: row.created_at,
  };
}

function filesOf(manifest: VersionRow["manifest"]): PublicSkillFile[] {
  const list = Array.isArray(manifest?.files) ? manifest.files : [];
  return list.flatMap((file) =>
    typeof file.path === "string" && typeof file.size === "number" ? [{ path: file.path, kind: typeof file.kind === "string" ? file.kind : "other", size: file.size, script: file.script === true }] : [],
  );
}

const versionOf = (row: VersionRow): PublicSkillVersion => ({
  version: row.version,
  changelog: (row.changelog ?? "").trim(),
  fileCount: row.file_count ?? 0,
  packageSize: row.package_size ?? 0,
  createdAt: row.created_at,
  deprecated: row.deprecated_at !== null,
});

async function fetchRows(client: RestClient, ids: string[], columns: string): Promise<SkillRow[]> {
  if (ids.length === 0) return [];
  const params = publicFilters(new URLSearchParams({ select: columns }));
  params.set("id", `in.(${ids.join(",")})`);
  params.set("limit", String(ids.length));
  const rows = await client.select<SkillRow>("skills", params);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export interface SkillSearchParams extends Pick<SearchParams, "query" | "tags" | "limit" | "cursor"> {
  sort?: string | null;
  category?: string | null;
  /** Uyumlu araç(lar): herhangi biri eşleşir. */
  compat?: string[] | null;
  license?: string | null;
  /** true = yalnız indirilebilir paketi olanlar. */
  hasPackage?: boolean | null;
}

/** Herkese açık Skill arama: `skill_feed_page` (keyset). Sorgu boşsa en yeni (ya da seçilen sıralama). */
export async function searchPublicSkills(client: RestClient, input: SkillSearchParams = {}): Promise<Page<PublicSkillSummary>> {
  const limit = clampLimit(input.limit);
  const query = (input.query ?? "").trim().slice(0, PUBLIC_LIMITS.query);
  const sort = oneOf(input.sort, PUBLIC_SKILL_SORTS, "sort", "new");
  const category = input.category ? oneOf(input.category, PUBLIC_SKILL_CATEGORIES, "category", "software") : null;
  const license = input.license ? oneOf(input.license, PUBLIC_SKILL_LICENSES, "license", "mit") : null;
  const compat = (input.compat ?? []).filter((id) => id.trim() !== "").map((id) => oneOf(id, PUBLIC_SKILL_COMPAT, "compat", "other"));
  if (compat.length > PUBLIC_LIMITS.filterItems) bad(`compat takes at most ${PUBLIC_LIMITS.filterItems} items.`);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const rows = await client.rpc<{ id: string; created_at: string; sort_rank: number | string; match_source: string | null }[]>("skill_feed_page", {
    p_query: query || null,
    p_sort: sort,
    p_category: category,
    p_compat: compat.length ? compat : null,
    p_license: license,
    p_has_package: input.hasPackage === true ? true : null,
    p_author_ids: null,
    p_tag_slugs: slugList(input.tags?.map(normalizeTagLabel), "tag", SLUG_PATTERN),
    p_limit: limit,
    p_after_rank: cursor ? cursor.r : null,
    p_after_created_at: cursor ? cursor.c : null,
    p_after_id: cursor ? cursor.i : null,
  });
  const list = rows ?? [];
  const last = list[list.length - 1];
  const hydrated = await fetchRows(client, list.map((row) => row.id), LIST_COLUMNS);
  const matched = new Map(list.map((row) => [row.id, row.match_source]));
  return {
    items: hydrated.map((row) => {
      const summary = summaryOf(row, client.siteUrl);
      const source = matched.get(row.id);
      return source ? { ...summary, matchedIn: source } : summary;
    }),
    nextCursor: list.length >= limit && last ? encodeCursor({ r: Number(last.sort_rank), c: last.created_at, i: last.id }) : null,
  };
}

async function latestVersion(client: RestClient, skillId: string, version?: string): Promise<VersionRow | null> {
  const params = new URLSearchParams({ select: "version,instructions,changelog,package_size,file_count,manifest,created_at,deprecated_at" });
  params.set("skill_id", `eq.${skillId}`);
  if (version) params.set("version", `eq.${version}`);
  params.set("order", "created_at.desc");
  params.set("limit", "1");
  return (await client.select<VersionRow>("skill_versions", params))[0] ?? null;
}

/**
 * Tek herkese açık Skill (SKILL.md gövdesi + sürümün dosya listesi). `version` verilmezse son sürüm, verilirse o sürüm (sabitlenmiş sürümü okumak için). Bulunamayan, taslak ya da özel → `not_found`.
 * Gövde ve sürüm numarası YAYINLANMIŞ sürümden gelir (sahibin sonradan değiştirdiği çalışma kopyası okuyucuya yansımaz); anlık görüntüsü olmayan eski sürümde çalışma kopyası döner ve `instructionsSource` bunu söyler.
 */
export async function getPublicSkill(client: RestClient, id: string, version?: string | null): Promise<PublicSkill> {
  const key = id.trim();
  if (!isUuid(key)) bad("id must be a Skill UUID.");
  const wanted = version?.trim();
  if (wanted && !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(wanted)) bad("version must look like 1.2.3.");
  const [row] = await fetchRows(client, [key], DETAIL_COLUMNS);
  if (!row) throw new PublicApiError("not_found", "Skill not found.");
  const found = await latestVersion(client, key, wanted || undefined);
  if (wanted && !found) throw new PublicApiError("not_found", "Version not found.");
  const relParams = new URLSearchParams({ select: "target_type,target_id,position", skill_id: `eq.${key}`, order: "position.asc", limit: "20" });
  const relations = await client.select<{ target_type: string; target_id: string }>("skill_relations", relParams).catch(() => []);
  const workingCopy = row.instructions ?? "";
  const snapshot = found && typeof found.instructions === "string" ? found.instructions : null;
  return {
    ...summaryOf(row, client.siteUrl),
    // Skill'in sürümü varsa gösterilen sürüm yayınlanan sürümdür (`skills.version` çalışma kopyası etiketidir).
    ...(found ? { version: found.version } : {}),
    instructions: snapshot ?? workingCopy,
    instructionsSource: snapshot !== null ? "published" : "working_copy",
    hasUnpublishedChanges: snapshot !== null && !wanted && snapshot !== workingCopy,
    latestVersion: found ? versionOf(found) : null,
    files: found ? filesOf(found.manifest) : [],
    related: relations.filter((r) => isUuid(r.target_id)).map((r) => ({ type: r.target_type, id: r.target_id, url: `${client.siteUrl}${sharePathFor(r.target_type as "prompt" | "workflow" | "preset", r.target_id)}` })),
  };
}

/** Bir Skill sürümünün dosya listesi (varsayılan: son sürüm). Paket yoksa boş liste. */
export async function listPublicSkillFiles(client: RestClient, id: string, version?: string | null): Promise<{ version: string | null; files: PublicSkillFile[] }> {
  const key = id.trim();
  if (!isUuid(key)) bad("id must be a Skill UUID.");
  const wanted = version?.trim();
  if (wanted && !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(wanted)) bad("version must look like 1.2.3.");
  const [row] = await fetchRows(client, [key], "id,title");
  if (!row) throw new PublicApiError("not_found", "Skill not found.");
  const found = await latestVersion(client, key, wanted || undefined);
  if (wanted && !found) throw new PublicApiError("not_found", "Version not found.");
  return { version: found?.version ?? null, files: found ? filesOf(found.manifest) : [] };
}

