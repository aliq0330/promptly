/**
 * Okuma isteklerinin ağ katmanı (docs/history/465-*): Supabase istemcisinin `global.fetch` zincirine giren üç halka.
 *
 * Canlı ölçüm: Nano sunucuda (0,5 GB RAM) PostgREST boşta kalan bağlantılarını kapatır; bir istek dalgası gelince yeni (SOĞUK) bağlantılar
 * açılır ve her soğuk bağlantının ilk sorguları katalog/RLS yüklemesi yüzünden 10–100 kat yavaştır (RLS'li bir sayım: soğukta 406 ms, sıcakta
 * 3,5 ms). Sayfa açılışında aynı anda 20+ istek + aynı isteğin 4–7 kopyası → dakikalarca süren donmalar ve `statement timeout` (500).
 *   1) `coalesceReads`: aynı anda giden AYNI okuma isteği (yöntem + adres + gövde + kimlik) tek ağ isteğinde birleşir; her çağıran kendi
 *      `Response` kopyasını alır. Yalnız 1,5 sn içinde başlamış uçuştaki isteğe katılınır — tamamlanmış yanıt saklanmaz (bayat veri yok),
 *      asılı kalmış eski isteğe de katılınmaz ("Tekrar dene" yeni istek atar).
 *   2) `retryTransientReads`: sunucu geçici hatası (502/503/504/52x, sorgu zaman aşımı `57014`, bağlantı/havuz hataları) 2 sn, 5 sn, 15 sn
 *      sonra (±%25 sapma) yeniden denenir; ağ hatası (bağlantı yok) yalnız bir kez, 1,5 sn sonra. Bekleme sırasında eşzamanlılık sırası
 *      TUTULMAZ (bu halka sınırlayıcının dışında).
 *   3) `limitReadConcurrency`: aynı anda en çok `max` okuma isteği ağa çıkar, gerisi sırada bekler (arka plan okumaları en sonda); cevap
 *      vermeyen istek yerini en çok 15 sn tutar. PostgREST böylece sayfa başına daha az soğuk bağlantı açar.
 * YALNIZ salt-okunur istekler etkilenir: `/rest/v1` üzerinde GET/HEAD ve `READ_ONLY_RPCS` listesindeki RPC'ler. Listedeki her işlev veritabanında
 * STABLE/IMMUTABLE'dır — Postgres bu işlevlerin veri yazmasına izin vermez, yani tekrar göndermek ya da birleştirmek yan etki üretmez
 * (`read-requests.test.ts` migration'lardan denetler). Yazan RPC'ler, auth, storage, Edge ve Realtime hiç değişmeden geçer.
 */

/** İstemcinin çağırdığı, her sürümü STABLE/IMMUTABLE olan RPC'ler (yeni bir okuma RPC'si eklenince buraya da eklenebilir; eklenmezse yalnız bu katmanlardan yararlanmaz). */
export const READ_ONLY_RPCS: ReadonlySet<string> = new Set([
  "admin_media_appearance_stats", "admin_media_missing_appearance", "admin_site_stats", "admin_skill_stats", "admin_user_activity", "admin_user_audit",
  "admin_user_files", "admin_users", "browse_communities", "chat_group_members", "chat_shared_items", "chat_shared_stats", "collection_members_list",
  "collection_unshareable_items", "comment_history", "comment_reaction_counts", "common_communities", "community_card_covers", "community_cards",
  "community_domains", "community_events_presence", "community_last_rooms", "community_link_presence_count", "community_migration_report",
  "community_presence_counts", "community_rooms_overview", "community_stats", "content_engagers", "conversation_last_messages", "discover_communities",
  "discover_editorial_feed", "discover_feed_page", "discover_rising_tools", "discover_tool_counts", "discover_trending_topics", "discover_weekly_stats",
  "dna_similar_candidates", "feed_count", "feed_page", "feed_page_proven", "feed_page_rising", "filter_messageable_users", "follow_feed_settings_get",
  "following_activity_page", "following_activity_summary", "following_people_overview", "for_you_page", "get_my_call_settings", "get_my_quiet_hours",
  "group_unread_counts", "is_moderator", "list_my_api_tokens", "list_my_communities", "list_my_oauth_grants", "list_my_telegram_links", "list_spaces",
  "list_starred_messages", "member_feed_page", "message_read_receipts", "moderation_report_queue", "my_collection_invitations",
  "my_comment_subscriptions", "my_community_unseen_counts", "my_room_pins", "my_team_invitations", "my_team_todos", "my_teams", "my_teams_preview",
  "notifications_group_members", "notifications_grouped_page", "notifications_snooze_summary", "notifications_unread_by_category",
  "notifications_unread_group_count", "oauth_request_info", "presence_lookup", "preview_team_link", "profile_collections", "profile_content_stats",
  "profile_quote_count", "profile_quotes_page", "profile_result_count", "profile_results", "prompt_works_for_users", "prompt_works_state",
  "quote_feed_cards", "recommend_communities", "related_presets", "related_prompts", "related_requests", "related_skills", "related_workflows",
  "search_communities", "search_content", "search_conversation_messages", "search_quotes", "skill_feed_page", "skill_works_by_tool",
  "skill_works_by_version", "skill_works_state", "skills_for_content", "space_role", "story_poll_results", "story_tray", "story_viewers",
  "suggest_communities", "suggest_creators", "team_access_overview", "team_area_info", "team_audit_list", "team_channel_access", "team_channel_members",
  "team_channels_overview", "team_content_location", "team_insights", "team_list_groups", "team_list_guests", "team_list_invitations",
  "team_list_invite_links", "team_list_members", "team_list_spaces", "team_member_project_roles", "team_my_can", "team_my_mutes",
  "team_my_project_role", "team_my_space_levels", "team_project_access", "team_project_channels", "team_project_get", "team_project_todos",
  "team_projects_list", "team_recent_activity", "team_space_access", "team_variables_list", "trending_tags", "workflow_space_links",
]);

/** Ekranı beklemeyen arka plan okumaları: sırada görünür içerikten SONRA gider (rozet, sessize alma, sessiz saatler…). */
export const BACKGROUND_READS: ReadonlySet<string> = new Set([
  "notifications_snooze_summary", "get_my_quiet_hours", "my_teams_preview", "team_my_mutes", "community_last_rooms", "my_community_unseen_counts",
  "my_team_todos", "team_project_todos", "my_collection_invitations", "my_team_invitations", "my_comment_subscriptions", "is_moderator",
]);

/** Sunucu yükü/bağlantı kaynaklı, aynı isteği biraz sonra tekrarlamanın düzelttiği hatalar (PostgreSQL SQLSTATE + PostgREST kodları). */
const TRANSIENT_DB_CODES = new Set([
  "57014", // statement_timeout (canlıdaki 500'lerin kaynağı)
  "57P01", "57P02", "57P03", // admin/crash shutdown, cannot connect now
  "53300", "53400", // too many connections, configuration limit exceeded
  "08000", "08001", "08003", "08004", "08006", // connection exception ailesi
  "40001", "40P01", // serialization failure, deadlock (okumada güvenle tekrarlanır)
  "PGRST000", "PGRST001", "PGRST002", "PGRST003", // PostgREST: veritabanına bağlanamadı / havuz zaman aşımı
]);
const TRANSIENT_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524]);

export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000] as const;
/** Ağ hatası (bağlantı yok/koptu) sunucu yükü değildir: tek, kısa bir yeniden deneme; sonra hata hemen ekrana çıkar ("Sohbet yüklenemedi" geç kalmasın). */
export const NETWORK_RETRY_DELAYS_MS = [1_500] as const;
export const MAX_CONCURRENT_READS = 6;
/** Yalnız bu kadar yeni başlamış aynı isteğe katılınır; daha eskisi (ör. asılı kalmış) yeniden denemeyi yutmasın diye yeni istek atılır. */
export const COALESCE_JOIN_MS = 1_500;
/** Cevap vermeyen bir istek sıradaki yerini en çok bu kadar tutar; sonra yer boşalır (asılı istekler sırayı kilitlemez). */
export const SLOT_HOLD_MS = 15_000;

export interface ReadRequestInfo {
  /** Salt-okunur mu (yalnız `/rest/v1`). */
  read: boolean;
  /** RPC adı (RPC ise). */
  rpc: string | null;
  method: string;
  url: string;
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
}

/** İsteğin salt-okunur bir `/rest/v1` okuması olup olmadığı (saf; test edilir). */
export function classifyRequest(input: RequestInfo | URL, init?: RequestInit): ReadRequestInfo {
  const url = requestUrl(input);
  const method = requestMethod(input, init);
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return { read: false, rpc: null, method, url };
  }
  const at = path.indexOf("/rest/v1/");
  if (at < 0) return { read: false, rpc: null, method, url };
  const rest = path.slice(at + "/rest/v1/".length);
  if (rest.startsWith("rpc/")) {
    const rpc = rest.slice(4).split("/")[0] ?? "";
    const read = method === "GET" || method === "HEAD" || (method === "POST" && READ_ONLY_RPCS.has(rpc));
    return { read, rpc, method, url };
  }
  return { read: method === "GET" || method === "HEAD", rpc: null, method, url };
}

function headerValue(init: RequestInit | undefined, name: string): string {
  try {
    return new Headers(init?.headers).get(name) ?? "";
  } catch {
    return "";
  }
}

/** Birleştirme anahtarı: aynı kimlikle aynı yanıtı verecek her şey. Gövdesi metin olmayan istek birleşmez (null). */
export function readRequestKey(info: ReadRequestInfo, init?: RequestInit): string | null {
  const body = init?.body;
  if (body != null && typeof body !== "string") return null;
  return [
    info.method,
    info.url,
    body ?? "",
    headerValue(init, "authorization"),
    headerValue(init, "apikey"),
    headerValue(init, "accept"),
    headerValue(init, "prefer"),
    headerValue(init, "range"),
    headerValue(init, "accept-profile"),
    headerValue(init, "content-profile"),
  ].join("\u0001");
}

interface Template {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
}

async function toTemplate(response: Response): Promise<Template> {
  return { status: response.status, statusText: response.statusText, headers: Array.from(response.headers.entries()), body: await response.text() };
}

function toResponse(template: Template): Response {
  // 204/205/304 gövde taşıyamaz.
  const nullBody = template.status === 204 || template.status === 205 || template.status === 304;
  return new Response(nullBody ? null : template.body, { status: template.status, statusText: template.statusText, headers: template.headers });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/** Bir sözü çağıranın kendi `AbortSignal`'ına bağlar (paylaşılan istek iptal edilmez, yalnız bu çağıranın beklemesi biter). */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** (1) Aynı anda giden aynı okuma isteğini tek ağ isteğinde birleştirir (yalnız `joinMs` içinde başlamış olana katılınır). */
export function coalesceReads(baseFetch: typeof fetch, { joinMs = COALESCE_JOIN_MS, now = Date.now }: { joinMs?: number; now?: () => number } = {}): typeof fetch {
  const inflight = new Map<string, { promise: Promise<Template>; startedAt: number }>();
  return async (input, init) => {
    const info = classifyRequest(input, init);
    if (!info.read) return baseFetch(input, init);
    const key = readRequestKey(info, init);
    if (key === null) return baseFetch(input, init);
    const existing = inflight.get(key);
    let shared: Promise<Template>;
    if (existing && now() - existing.startedAt <= joinMs) {
      shared = existing.promise;
    } else {
      // Paylaşılan istek tek bir çağıranın iptaliyle kesilmez: sinyal paylaşılan isteğe verilmez, her çağıran kendi sinyaliyle bekler.
      const sharedInit: RequestInit = init ? { ...init, signal: undefined } : {};
      shared = baseFetch(input, sharedInit).then(toTemplate);
      const entry = { promise: shared, startedAt: now() };
      inflight.set(key, entry);
      const forget = () => {
        if (inflight.get(key) === entry) inflight.delete(key);
      };
      shared.then(forget, forget);
    }
    return withAbort(shared.then(toResponse), init?.signal);
  };
}

/** Yanıt geçici bir sunucu/bağlantı hatası mı (aynı istek biraz sonra başarılı olabilir)? */
export async function isTransientResponse(response: Response): Promise<boolean> {
  if (TRANSIENT_STATUSES.has(response.status)) return true;
  if (response.status !== 500) return false;
  try {
    const body = (await response.clone().json()) as { code?: unknown } | null;
    return typeof body?.code === "string" && TRANSIENT_DB_CODES.has(body.code);
  } catch {
    return false;
  }
}

/** Fırlatılan hata bir ağ hatası mı (iptal DEĞİL)? */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError") return false;
  return error instanceof TypeError;
}

export interface RetryOptions {
  delays?: readonly number[];
  networkDelays?: readonly number[];
  sleep?: (ms: number, signal?: AbortSignal | null) => Promise<void>;
  random?: () => number;
}

function defaultSleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal as AbortSignal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Bekleme süresi: taban ± %25 (aynı anda takılan sekmeler aynı anda dönmesin). */
export function retryDelay(base: number, random: () => number = Math.random): number {
  return Math.round(base * (0.75 + random() * 0.5));
}

/** (2) Salt-okunur istekleri geçici hatalarda geri çekilerek yeniden dener. */
export function retryTransientReads(baseFetch: typeof fetch, options: RetryOptions = {}): typeof fetch {
  const { delays = RETRY_DELAYS_MS, networkDelays = NETWORK_RETRY_DELAYS_MS, sleep = defaultSleep, random = Math.random } = options;
  return async (input, init) => {
    const info = classifyRequest(input, init);
    if (!info.read) return baseFetch(input, init);
    let serverRetries = 0;
    let networkRetries = 0;
    for (;;) {
      let response: Response;
      try {
        response = await baseFetch(input, init);
      } catch (error) {
        if (networkRetries >= networkDelays.length || !isNetworkError(error) || init?.signal?.aborted) throw error;
        await sleep(retryDelay(networkDelays[networkRetries], random), init?.signal);
        networkRetries += 1;
        continue;
      }
      if (serverRetries >= delays.length || !(await isTransientResponse(response))) return response;
      await sleep(retryDelay(delays[serverRetries], random), init?.signal);
      serverRetries += 1;
    }
  };
}

interface Waiter {
  start: () => void;
  background: boolean;
}

/** (3) Aynı anda ağa çıkan okuma sayısını sınırlar; arka plan okumaları sıranın sonuna geçer. Yazma istekleri hiç beklemez. */
export function limitReadConcurrency(baseFetch: typeof fetch, max: number = MAX_CONCURRENT_READS, holdMs: number = SLOT_HOLD_MS): typeof fetch {
  let active = 0;
  const queue: Waiter[] = [];
  const next = () => {
    while (active < max && queue.length > 0) {
      const index = queue.findIndex((waiter) => !waiter.background);
      const [waiter] = queue.splice(index >= 0 ? index : 0, 1);
      active += 1;
      waiter.start();
    }
  };
  return (input, init) => {
    const info = classifyRequest(input, init);
    if (!info.read) return baseFetch(input, init);
    const background = info.rpc !== null && BACKGROUND_READS.has(info.rpc);
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      let started = false;
      const waiter: Waiter = {
        background,
        start: () => {
          started = true;
          signal?.removeEventListener("abort", onAbort);
          let settled = false;
          const release = () => {
            if (settled) return;
            settled = true;
            clearTimeout(holdTimer);
            active -= 1;
            next();
          };
          // Asılı kalan istek yeri sonsuza dek tutmasın: süre dolunca yer boşalır, istek yine de beklenir.
          const holdTimer = setTimeout(release, holdMs);
          baseFetch(input, init).then(
            (response) => {
              release();
              resolve(response);
            },
            (error) => {
              release();
              reject(error);
            },
          );
        },
      };
      const onAbort = () => {
        if (started) return;
        const at = queue.indexOf(waiter);
        if (at >= 0) queue.splice(at, 1);
        reject(abortError(signal as AbortSignal));
      };
      if (signal?.aborted) return reject(abortError(signal));
      signal?.addEventListener("abort", onAbort, { once: true });
      queue.push(waiter);
      next();
    });
  };
}
