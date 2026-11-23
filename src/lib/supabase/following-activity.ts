import { supabase } from "./client";
import { hydrateFeedRows, type FeedEntry, type FeedKind, type FeedRow } from "./feed";
import { PROFILE_SELECT } from "./profiles";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { fetchResultById } from "./prompt-results";
import { fetchRequestsByIds } from "./requests";
import { dedupeActivity, diffLines, addedVariables, nextActivityCursor, type ActivityCursor, type DiffLine } from "@/lib/following-feed";
import type { PromptRequest, PromptResult, UserProfile } from "@/types";

/**
 * Takip Ettiklerin etkinlik akışı (docs/history/451-*). Sırayı ve görünürlüğü YALNIZ veritabanı belirler (`following_activity_page`,
 * SECURITY INVOKER: RLS atlanmaz). Bu dosya satırları ekranda çizilecek nesnelere doldurur: paylaşımlar `feed_page`'in doldurucusuyla
 * (`hydrateFeedRows` — liste sayfalarıyla aynı seçimler), sürümlerde prompt metninin farkı, sonuçlarda sonuç satırı, Space etkinliğinde
 * o saatte eklenen görseller. Okunamayan (silinmiş / engellenmiş) öğe sessizce düşer.
 */

export type ActivitySource = "all" | "people" | "tags" | "tools" | "spaces";
export type { ActivityCursor };

interface ActivityRow {
  event_key: string;
  event_kind: "post" | "group" | "version" | "space_activity" | "result";
  source: "people" | "tag" | "tool" | "space";
  actor_id: string;
  occurred_at: string;
  item_kind: string;
  item_id: string | null;
  member_ids: string[] | null;
  detail: Record<string, unknown> | null;
}

interface EventBase {
  key: string;
  at: string;
  actor: UserProfile | null;
}
export type ActivityEvent =
  | (EventBase & {
      kind: "post";
      source: "people" | "tag" | "tool";
      item: FeedEntry;
      tags: string[];
      /** İsteğe yanıt olan promptta yanıtlanan istek (okunamıyorsa null). */
      answered: PromptRequest | null;
    })
  | (EventBase & { kind: "group"; items: FeedEntry[]; firstAt: string | null })
  | (EventBase & {
      kind: "version";
      item: FeedEntry;
      version: string;
      /** Prompt metninin bir önceki sürüme göre farkı; başka türde (workflow, ayar paketi, Skill) yok. */
      diff: DiffLine[] | null;
      newVariables: string[];
    })
  | (EventBase & {
      kind: "space_activity";
      space: { id: string; title: string };
      count: number;
      actions: string[];
      note: string | null;
      images: string[];
    })
  | (EventBase & { kind: "result"; result: PromptResult });

export interface ActivityPage {
  events: ActivityEvent[];
  nextCursor: ActivityCursor | null;
  /** Sayfadaki ham satır sayısı (ayıklamadan önce). */
  rawCount: number;
}

export interface ActivityQuery {
  source: ActivitySource;
  kinds?: FeedKind[] | null;
  authors?: string[] | null;
  tags?: string[] | null;
  tools?: string[] | null;
}

export const ACTIVITY_PAGE_SIZE = 20;

const itemKey = (kind: string, id: string) => `${kind}:${id}`;

export async function fetchActivityPage(
  query: ActivityQuery,
  cursor: ActivityCursor | null,
  seen: Set<string>,
  limit = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  const { data, error } = await supabase.rpc("following_activity_page", {
    p_limit: limit,
    p_before_at: cursor?.at ?? null,
    p_before_key: cursor?.key ?? null,
    p_source: query.source,
    p_kinds: query.kinds?.length ? query.kinds : null,
    p_authors: query.authors?.length ? query.authors : null,
    p_tags: query.tags?.length ? query.tags : null,
    p_tools: query.tools?.length ? query.tools : null,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ActivityRow[];
  const deduped = dedupeActivity(
    rows.map((row) => ({
      key: row.event_key,
      kind: row.event_kind,
      item: row.event_kind === "post" && row.item_id ? itemKey(row.item_kind, row.item_id) : null,
      members: row.member_ids ?? undefined,
      row,
    })),
    seen,
  );
  const events = await hydrateEvents(deduped);
  return { events, nextCursor: nextActivityCursor(rows, limit), rawCount: rows.length };
}

type DedupedRow = { key: string; kind: string; item: string | null; members?: string[]; row: ActivityRow };

async function hydrateEvents(list: DedupedRow[]): Promise<ActivityEvent[]> {
  // 1) Paylaşımlar (tekil, toplu üyeler, sürümün içeriği) tek doldurucudan.
  const refs = new Map<string, FeedRow>();
  const addRef = (ref: string, at: string) => {
    const [kind, id] = ref.split(":");
    if (kind && id && !refs.has(ref)) refs.set(ref, { kind: kind as FeedKind, id, created_at: at, sort_rank: 0 });
  };
  for (const entry of list) {
    if (entry.item) addRef(entry.item, entry.row.occurred_at);
    entry.members?.forEach((member) => addRef(member, entry.row.occurred_at));
    if (entry.kind === "version" && entry.row.item_id) addRef(itemKey(entry.row.item_kind, entry.row.item_id), entry.row.occurred_at);
  }
  // 2) Yazar bilgisi paylaşımda zaten var; diğer satırların kişisi ayrıca.
  const actorIds = [...new Set(list.filter((entry) => entry.kind !== "post" && entry.kind !== "group").map((entry) => entry.row.actor_id))];
  const [items, actors, results, versionTexts, spaceImages] = await Promise.all([
    hydrateFeedRows([...refs.values()]),
    fetchProfilesByIds(actorIds),
    Promise.all(list.filter((entry) => entry.kind === "result" && entry.row.item_id).map((entry) => fetchResultById(entry.row.item_id as string))),
    fetchVersionTexts(list.filter((entry) => entry.kind === "version" && entry.row.item_kind === "prompt").map((entry) => entry.row)),
    fetchSpaceImages(list.filter((entry) => entry.kind === "space_activity").map((entry) => entry.row)),
  ]);
  const itemsByKey = new Map(items.map((item) => [itemKey(item.kind, item.data.id), item]));
  // İsteğe yanıt olan promptların istekleri (tek sorgu).
  const requestIds = [
    ...new Set(items.flatMap((item) => (item.kind === "prompt" && item.data.origin.type === "request-response" ? [item.data.origin.requestId] : []))),
  ];
  const requests = requestIds.length > 0 ? await fetchRequestsByIds(requestIds).catch(() => [] as PromptRequest[]) : [];
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const answeredOf = (item: FeedEntry): PromptRequest | null =>
    item.kind === "prompt" && item.data.origin.type === "request-response" ? (requestById.get(item.data.origin.requestId) ?? null) : null;
  const actorById = new Map(actors.map((profile) => [profile.id, profile]));
  const resultById = new Map(results.filter((result): result is PromptResult => result !== null).map((result) => [result.id, result]));
  const authorOf = (item: FeedEntry): UserProfile | null => {
    const data = item.data as { author?: UserProfile; creator?: UserProfile };
    return data.author ?? data.creator ?? null;
  };

  const events: ActivityEvent[] = [];
  for (const entry of list) {
    const { row } = entry;
    const base = { key: row.event_key, at: row.occurred_at };
    if (entry.kind === "post" && entry.item) {
      const item = itemsByKey.get(entry.item);
      if (!item) continue;
      const tags = Array.isArray(row.detail?.tags) ? (row.detail?.tags as string[]) : [];
      const source = row.source === "tag" || row.source === "tool" ? row.source : "people";
      events.push({ ...base, kind: "post", source, actor: authorOf(item), item, tags, answered: answeredOf(item) });
    } else if (entry.kind === "group" && entry.members) {
      const groupItems = entry.members.map((member) => itemsByKey.get(member)).filter((item): item is FeedEntry => Boolean(item));
      if (groupItems.length === 0) continue;
      if (groupItems.length === 1) {
        events.push({ ...base, kind: "post", source: "people", actor: authorOf(groupItems[0]), item: groupItems[0], tags: [], answered: answeredOf(groupItems[0]) });
        continue;
      }
      const firstAt = typeof row.detail?.first_at === "string" ? (row.detail.first_at as string) : null;
      events.push({ ...base, kind: "group", actor: authorOf(groupItems[0]), items: groupItems, firstAt });
    } else if (entry.kind === "version" && row.item_id) {
      const item = itemsByKey.get(itemKey(row.item_kind, row.item_id));
      if (!item) continue;
      const version = String(row.detail?.version ?? "");
      const texts = versionTexts.get(`${row.item_id}:${version}`);
      events.push({
        ...base,
        kind: "version",
        actor: actorById.get(row.actor_id) ?? authorOf(item),
        item,
        version,
        diff: texts ? diffLines(texts.before, texts.after) : null,
        newVariables: texts ? addedVariables(texts.before, texts.after) : [],
      });
    } else if (entry.kind === "space_activity" && row.item_id) {
      events.push({
        ...base,
        kind: "space_activity",
        actor: actorById.get(row.actor_id) ?? null,
        space: { id: row.item_id, title: String(row.detail?.title ?? "") },
        count: Number(row.detail?.count ?? 0),
        actions: Array.isArray(row.detail?.actions) ? (row.detail?.actions as string[]) : [],
        note: typeof row.detail?.note === "string" ? (row.detail.note as string) : null,
        images: spaceImages.get(row.event_key) ?? [],
      });
    } else if (entry.kind === "result" && row.item_id) {
      const result = resultById.get(row.item_id);
      if (!result) continue;
      events.push({ ...base, kind: "result", actor: actorById.get(row.actor_id) ?? result.creator, result });
    }
  }
  return events;
}

async function fetchProfilesByIds(ids: string[]): Promise<UserProfile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).in("id", ids).limit(100);
  if (error) return [];
  return ((data ?? []) as ProfileRow[]).map(mapProfileRow);
}

/** Prompt sürümünün metni ve bir önceki sürümünkü (fark için). Anahtar `<prompt>:<sürüm>`. */
async function fetchVersionTexts(rows: ActivityRow[]): Promise<Map<string, { before: string; after: string }>> {
  const out = new Map<string, { before: string; after: string }>();
  await Promise.all(
    rows.map(async (row) => {
      const version = Number(row.detail?.version);
      if (!row.item_id || !Number.isFinite(version) || version < 2) return;
      const { data } = await supabase
        .from("prompt_versions")
        .select("version_number, prompt_text")
        .eq("prompt_id", row.item_id)
        .lte("version_number", version)
        .order("version_number", { ascending: false })
        .limit(2);
      const list = (data ?? []) as { version_number: number; prompt_text: string }[];
      if (list.length === 2) out.set(`${row.item_id}:${version}`, { after: list[0].prompt_text, before: list[1].prompt_text });
    }),
  );
  return out;
}

/** Space etkinliğinde o saat içinde o kişinin eklediği görseller (en çok 6; `space-media` kimlik adresi, `StorageImg` imzalar). */
async function fetchSpaceImages(rows: ActivityRow[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  await Promise.all(
    rows.map(async (row) => {
      const from = typeof row.detail?.from === "string" ? (row.detail.from as string) : null;
      const to = typeof row.detail?.to === "string" ? (row.detail.to as string) : null;
      if (!row.item_id || !from || !to) return;
      const fromAt = new Date(new Date(from).getTime() - 60_000).toISOString();
      const toAt = new Date(new Date(to).getTime() + 60_000).toISOString();
      const { data } = await supabase
        .from("space_items")
        .select("media_url")
        .eq("space_id", row.item_id)
        .eq("created_by", row.actor_id)
        .eq("kind", "image")
        .gte("created_at", fromAt)
        .lte("created_at", toAt)
        .order("created_at", { ascending: false })
        .limit(6);
      const urls = ((data ?? []) as { media_url: string | null }[]).map((item) => item.media_url).filter((url): url is string => Boolean(url));
      out.set(row.event_key, urls);
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Tercihler, ziyaret, kişi modu, özet, kişi listesi
// ---------------------------------------------------------------------------------------------------------------------------

export interface FollowFeedSettings {
  groupPosts: boolean;
  includeTags: boolean;
  includeTools: boolean;
  showVersions: boolean;
  showSpaceActivity: boolean;
  showResults: boolean;
}
export const DEFAULT_FOLLOW_FEED_SETTINGS: FollowFeedSettings = {
  groupPosts: true,
  includeTags: true,
  includeTools: false,
  showVersions: true,
  showSpaceActivity: true,
  showResults: false,
};

export async function fetchFollowFeedSettings(): Promise<FollowFeedSettings> {
  const { data, error } = await supabase.rpc("follow_feed_settings_get");
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Record<string, boolean | null>[])[0];
  if (!row) return DEFAULT_FOLLOW_FEED_SETTINGS;
  return {
    groupPosts: row.group_posts ?? true,
    includeTags: row.include_tags ?? true,
    includeTools: row.include_tools ?? false,
    showVersions: row.show_versions ?? true,
    showSpaceActivity: row.show_space_activity ?? true,
    showResults: row.show_results ?? false,
  };
}

export async function updateFollowFeedSettings(patch: Partial<FollowFeedSettings>): Promise<void> {
  const { error } = await supabase.rpc("follow_feed_settings_set", {
    p_group_posts: patch.groupPosts ?? null,
    p_include_tags: patch.includeTags ?? null,
    p_include_tools: patch.includeTools ?? null,
    p_show_versions: patch.showVersions ?? null,
    p_show_space_activity: patch.showSpaceActivity ?? null,
    p_show_results: patch.showResults ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Bir önceki ziyaretin zamanı (ilk ziyarette null) ve şimdiyi yazar. `peek` yalnız okur. */
export async function recordFollowFeedVisit(peek = false): Promise<string | null> {
  const { data, error } = await supabase.rpc("follow_feed_visit", { p_peek: peek });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export type FollowFeedMode = "highlights" | "muted" | null;

export async function setFollowFeedMode(targetId: string, mode: FollowFeedMode): Promise<void> {
  const { error } = await supabase.rpc("set_follow_feed_mode", { p_target: targetId, p_mode: mode });
  if (error) throw new Error(error.message);
}

export interface ActivitySummary {
  since: string;
  posts: number;
  versions: number;
  spaces: number;
  tags: number;
  activePeople: number;
  actors: { id: string; count: number }[];
  following: number;
  tagsFollowed: number;
  toolsFollowed: number;
  spacesFollowed: number;
}

export async function fetchActivitySummary(since: string | null): Promise<ActivitySummary | null> {
  const { data, error } = await supabase.rpc("following_activity_summary", { p_since: since });
  if (error) throw new Error(error.message);
  const raw = data as Record<string, unknown> | null;
  if (!raw) return null;
  const num = (key: string) => Number(raw[key] ?? 0);
  return {
    since: String(raw.since ?? ""),
    posts: num("posts"),
    versions: num("versions"),
    spaces: num("spaces"),
    tags: num("tags"),
    activePeople: num("active_people"),
    actors: Array.isArray(raw.actors) ? (raw.actors as { id: string; count: number }[]) : [],
    following: num("following"),
    tagsFollowed: num("tags_followed"),
    toolsFollowed: num("tools_followed"),
    spacesFollowed: num("spaces_followed"),
  };
}

export interface FollowedPerson {
  profile: UserProfile;
  lastPostAt: string | null;
  weekCount: number;
  mode: FollowFeedMode;
}

export const FOLLOWED_PEOPLE_PAGE = 30;

export async function fetchFollowedPeoplePage(query: string, offset: number): Promise<FollowedPerson[]> {
  const { data, error } = await supabase.rpc("following_people_overview", {
    p_query: query.trim() || null,
    p_limit: FOLLOWED_PEOPLE_PAGE,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; username: string; display_name: string; avatar_url: string | null; last_post_at: string | null; week_count: number; mode: string | null }[]).map(
    (row) => ({
      profile: mapProfileRow({
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        cover_url: null,
        bio: null,
        website: null,
        follower_count: 0,
        following_count: 0,
        created_at: "",
        interests: null,
      }),
      lastPostAt: row.last_post_at,
      weekCount: row.week_count,
      mode: row.mode === "highlights" || row.mode === "muted" ? row.mode : null,
    }),
  );
}

/** Kişi çiplerinin yüzleri: özetteki kimlikler için profil. */
export async function fetchActorProfiles(ids: string[]): Promise<UserProfile[]> {
  return fetchProfilesByIds(ids);
}
