import { supabase } from "./client";
import { isPresenceAudience, isPresenceMode, parsePresenceTopic, type PresenceAudience, type PresenceMode } from "@/lib/presence";

/**
 * Çevrimiçi durum veri katmanı (docs/history/329-*). `presence_state` tablosuna istemci HİÇ dokunamaz; her şey SECURITY DEFINER RPC'lerdir ve
 * gizlilik (kitle, görünmez, karşılıklılık, engel, topluluk okunabilirliği) sunucuda uygulanır. Fonksiyonlar yoksa (migration henüz canlıda değil)
 * `PresenceUnavailableError` fırlatılır; özellik sessizce kapanır, site çalışmaya devam eder.
 */

export interface MyPresence {
  mode: PresenceMode;
  audience: PresenceAudience;
  topic: string;
  lastActiveAt: string | null;
}

export class PresenceUnavailableError extends Error {
  constructor() {
    super("presence_unavailable");
    this.name = "PresenceUnavailableError";
  }
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(error.message ?? "");
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isMissingFunction(error)) throw new PresenceUnavailableError();
    throw new Error(error.message || fn);
  }
  return data as T;
}

interface MyPresenceRow {
  mode: string;
  audience: string;
  topic: string;
  last_active_at: string | null;
}

function toMyPresence(rows: MyPresenceRow[] | MyPresenceRow | null): MyPresence | null {
  const row = Array.isArray(rows) ? rows[0] : rows;
  // Beklenmeyen yanıt (eski sunucu, vekil sayfası…): özellik kapalı sayılır — geçersiz kanal adıyla asla bağlanılmaz.
  if (!row || typeof row !== "object" || !parsePresenceTopic(row.topic)) return null;
  return {
    mode: isPresenceMode(row.mode) ? row.mode : "auto",
    audience: isPresenceAudience(row.audience) ? row.audience : "everyone",
    topic: row.topic,
    lastActiveAt: row.last_active_at,
  };
}

export async function fetchMyPresence(): Promise<MyPresence | null> {
  return toMyPresence(await rpc<MyPresenceRow[]>("my_presence"));
}

/** Son görülme nabzı; dönen değer güncel kendi ayarımdır (başka cihazdaki değişiklik böylece buraya da gelir). */
export async function sendPresenceHeartbeat(): Promise<MyPresence | null> {
  return toMyPresence(await rpc<MyPresenceRow[]>("presence_heartbeat"));
}

export async function updateMyPresence(change: { mode?: PresenceMode; audience?: PresenceAudience }): Promise<MyPresence | null> {
  return toMyPresence(await rpc<MyPresenceRow[]>("set_my_presence", { p_mode: change.mode ?? null, p_audience: change.audience ?? null }));
}

/** Telegram akıllı bildirimi: açık tuttuğum sayfa (null = yok). false = Telegram bildirimi yok, bu oturumda bir daha çağırma. */
export async function setPresenceFocus(key: string | null): Promise<boolean> {
  return (await rpc<boolean>("presence_set_focus", { p_key: key })) === true;
}

export interface PresenceLookupRow {
  userId: string;
  topic: string | null;
  lastActiveAt: string | null;
}

/** Görmeye yetkili olduğum kişiler (yetkisizler HİÇ dönmez). En çok 200 kimlik. */
export async function lookupPresence(ids: string[]): Promise<PresenceLookupRow[]> {
  if (ids.length === 0) return [];
  const rows = await rpc<{ user_id: string; topic: string | null; last_active_at: string | null }[]>("presence_lookup", { p_ids: ids.slice(0, 200) });
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => typeof row?.user_id === "string")
    .map((row) => ({ userId: row.user_id, topic: parsePresenceTopic(row.topic) ? row.topic : null, lastActiveAt: row.last_active_at ?? null }));
}

/** Topluluk başına "şu an aktif" sayısı; okuyamadığım topluluk dönmez. */
export async function fetchCommunityPresenceCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const rows = await rpc<{ community_id: string; online_count: number }[]>("community_presence_counts", { p_ids: ids.slice(0, 50) });
  for (const row of Array.isArray(rows) ? rows : []) if (typeof row?.community_id === "string") out.set(row.community_id, Number(row.online_count) || 0);
  return out;
}

/** Davet bağlantısı sayfası: yalnız geçerli bağlantı + herkese açık toplulukta sayı; aksi hâlde null. */
export async function fetchLinkPresenceCount(token: string): Promise<number | null> {
  const value = await rpc<number | null>("community_link_presence_count", { p_token: token });
  return typeof value === "number" ? value : null;
}

export interface OnlineMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: "owner" | "admin" | "moderator" | "member";
  joinedAt: string;
  lastActiveAt: string | null;
}

export async function fetchCommunityOnlineMembers(groupId: string, opts: { staffOnly?: boolean; limit?: number } = {}): Promise<OnlineMember[]> {
  const rows = await rpc<
    { user_id: string; username: string; display_name: string; avatar_url: string | null; role: OnlineMember["role"]; joined_at: string; last_active_at: string | null }[]
  >("community_online_members", { p_group_id: groupId, p_staff_only: opts.staffOnly ?? false, p_limit: opts.limit ?? 50 });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    joinedAt: row.joined_at,
    lastActiveAt: row.last_active_at,
  }));
}

export interface EventAttendee {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: "going" | "maybe";
}

export interface EventPresence {
  onlineCount: number;
  attendees: EventAttendee[];
}

export async function fetchEventsPresence(eventIds: string[]): Promise<Map<string, EventPresence>> {
  const out = new Map<string, EventPresence>();
  if (eventIds.length === 0) return out;
  const rows = await rpc<{ event_id: string; online_count: number; attendees: unknown }[]>("community_events_presence", { p_event_ids: eventIds.slice(0, 30) });
  for (const row of Array.isArray(rows) ? rows : []) {
    const list = Array.isArray(row.attendees) ? row.attendees : [];
    out.set(row.event_id, {
      onlineCount: row.online_count ?? 0,
      attendees: list
        .map((raw) => raw as { user_id?: string; username?: string; display_name?: string; avatar_url?: string | null; status?: string })
        .filter((a) => typeof a.user_id === "string")
        .map((a) => ({
          userId: a.user_id as string,
          username: a.username ?? "",
          displayName: a.display_name ?? a.username ?? "",
          avatarUrl: a.avatar_url ?? null,
          status: a.status === "maybe" ? "maybe" : "going",
        })),
    });
  }
  return out;
}
