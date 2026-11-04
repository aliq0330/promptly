"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { lookupPresence, PresenceUnavailableError } from "@/lib/supabase/presence";
import {
  PRESENCE_LOOKUP_BATCH,
  PRESENCE_REFRESH_MS,
  UNKNOWN_PRESENCE,
  derivePresence,
  idsNeedingLookup,
  liveFromPresenceState,
  selectLiveIds,
  type PresenceEntry,
  type PresenceView,
} from "@/lib/presence";

/**
 * Çevrimiçi durumunun sitede TEK kaynağı (docs/history/329-*). Aynı kişi sayfanın neresinde çizilirse çizilsin (sohbet listesi, dock, başlık,
 * profil, üye listesi…) aynı kaydı okur; her kişi için en çok BİR canlı kanal açılır.
 *
 *  - `watchPresence(ids)` bir bileşenin o kişileri gösterdiğini bildirir (sayaçlı; bileşen kapanınca bırakır).
 *  - İzlenen yeni/eski kimlikler 30 ms içinde toplanıp TEK `presence_lookup` çağrısıyla sorulur (≤200'lük parçalar). Sunucu yalnız görmeye
 *    YETKİLİ olduğum kişileri döndürür; dönmeyen kişi için hiçbir şey gösterilmez.
 *  - Canlı kanal: en son istenen en çok `PRESENCE_MAX_LIVE_CHANNELS` yetkili kişinin `presence:<kişi>:<anahtar>` kanalı dinlenir (yalnız dinleme;
 *    track yalnız kişinin kendisine açık). Fazlası son görülme penceresiyle gösterilir.
 *  - Kanal hata/kopma: o kişi son görülmeye düşer, kanal adı yeniden sorulur (anahtar dönmüş olabilir); aynı kanal adı artan aralıklarla
 *    (3 sn → 10 sn → 30 sn → 60 sn) yeniden denenir — sıkı döngü yok, kalıcı yetki kaybında da en çok dakikada bir deneme.
 *  - Sekme uzun süre gizlenince kanallar kapanır; görünür olunca yeniden açılır ve bayat kayıtlar yenilenir.
 *  - Kendi durumunu gizleyen (görünmez / "Hiç kimse") izleyici için bütün kayıtlar temizlenir — sunucu da zaten hiçbir şey döndürmez (karşılıklılık).
 *
 * Modül tekilidir: statik export'ta modül tek ziyaretçinin sekmesinde yaşar ve kimlik değişince sayfa baştan yüklenir (CLAUDE.md §8.10).
 */

interface Watch {
  count: number;
  lastAt: number;
  /** Sayaç 0'a indiği an (ms): bu andan `RELEASE_DELAY_MS` sonrasına kadar kanal açık kalır. */
  releasedAt?: number;
}

const entries = new Map<string, PresenceEntry>();
const watched = new Map<string, Watch>();
const channels = new Map<string, { topic: string; channel: RealtimeChannel }>();
/** Hata veren kanal adı → yeniden deneme zamanı + deneme sayısı (geri çekilme: 3 sn, 10 sn, 30 sn, 60 sn…). */
const failedTopics = new Map<string, { retryAt: number; attempts: number }>();
const RETRY_STEPS_MS = [3_000, 10_000, 30_000, 60_000];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const viewCache = new Map<string, { version: number; view: PresenceView }>();

let version = 0;
let viewerId: string | null = null;
let enabled = false;
let selfHidden = false;
let tabActive = true;
let unavailable = false;
let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
let watchSeq = 0;
/** Bırakılan kişinin kanalı bu süre sonra kapanır (yeniden izlenirse aynı kanal sürer). */
const RELEASE_DELAY_MS = 5000;

function emit() {
  version += 1;
  for (const fn of listeners) fn();
}

export function presenceSubscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function presenceVersion(): number {
  return version;
}

function canRun(): boolean {
  return enabled && !unavailable && !selfHidden && Boolean(viewerId);
}

/** Bir kişinin gösterilecek durumu. Aynı veride AYNI nesne döner (useSyncExternalStore için kararlı anlık görüntü). */
export function getPresenceView(userId: string | null | undefined): PresenceView {
  if (!userId || userId === viewerId || !canRun()) return UNKNOWN_PRESENCE;
  const cached = viewCache.get(userId);
  if (cached && cached.version === version) return cached.view;
  const next = derivePresence(entries.get(userId), Date.now());
  const view =
    cached && cached.view.visible === next.visible && cached.view.online === next.online && cached.view.lastSeenAt === next.lastSeenAt
      ? cached.view
      : next;
  viewCache.set(userId, { version, view });
  return view;
}

/** Bileşen bu kişileri gösteriyor: canlı/son görülme bilgisi istenir. Dönen fonksiyon bırakır. */
export function watchPresence(ids: readonly (string | null | undefined)[]): () => void {
  const list = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (list.length === 0) return () => {};
  watchSeq += 1;
  const at = watchSeq;
  for (const id of list) {
    const w = watched.get(id);
    watched.set(id, { count: (w?.count ?? 0) + 1, lastAt: at });
  }
  queueLookup(list);
  reconcile();
  return () => {
    for (const id of list) {
      const w = watched.get(id);
      if (!w) continue;
      // Sayaç 0'a inse de kayıt bir süre "bırakılmış" olarak kalır: sayfa geçişinde / panel açılırken aynı kişi yeniden izlenirse kanal
      // kapanıp yeniden açılmaz (başka bir bileşenin tetiklediği uzlaştırma da onu kapatmaz).
      if (w.count <= 1) watched.set(id, { count: 0, lastAt: w.lastAt, releasedAt: Date.now() });
      else watched.set(id, { count: w.count - 1, lastAt: w.lastAt });
    }
    setTimeout(reconcile, RELEASE_DELAY_MS + 50);
  };
}

function queueLookup(ids: string[]) {
  if (!canRun()) return;
  const stale = idsNeedingLookup(ids, entries, Date.now(), PRESENCE_REFRESH_MS);
  if (stale.length === 0) return;
  for (const id of stale) pending.add(id);
  if (!flushTimer) flushTimer = setTimeout(flush, 30);
}

async function flush() {
  flushTimer = null;
  if (inflight) {
    await inflight;
  }
  if (!canRun() || pending.size === 0) {
    pending.clear();
    return;
  }
  const ids = [...pending].filter((id) => id !== viewerId);
  pending = new Set();
  inflight = runLookup(ids).finally(() => {
    inflight = null;
  });
  await inflight;
}

async function runLookup(ids: string[]) {
  for (let i = 0; i < ids.length; i += PRESENCE_LOOKUP_BATCH) {
    const batch = ids.slice(i, i + PRESENCE_LOOKUP_BATCH);
    try {
      const rows = await lookupPresence(batch);
      if (!canRun()) return;
      const now = Date.now();
      const returned = new Map(rows.map((row) => [row.userId, row]));
      for (const id of batch) {
        const row = returned.get(id);
        const prev = entries.get(id);
        if (row) {
          const sameTopic = prev?.topic === row.topic;
          entries.set(id, { visible: true, topic: row.topic, lastSeenAt: row.lastActiveAt, live: sameTopic ? (prev?.live ?? null) : null, fetchedAt: now });
        } else {
          // Görmeye yetkili değilim (ya da kişi görünmez/gizli — ayırt edilemez): her şey silinir.
          entries.set(id, { visible: false, topic: null, lastSeenAt: null, live: null, fetchedAt: now });
        }
      }
    } catch (err) {
      if (err instanceof PresenceUnavailableError) {
        unavailable = true;
        closeAll();
        emit();
        return;
      }
      console.error("presence_lookup", err);
      // Geçici hata: bir sonraki yenilemede yeniden sorulur.
    }
  }
  reconcile();
  emit();
}

const relookTimers = new Map<string, ReturnType<typeof setTimeout>>();

function setLive(userId: string, topic: string, live: boolean | null) {
  const entry = entries.get(userId);
  if (!entry || entry.topic !== topic || entry.live === live) return;
  entries.set(userId, { ...entry, live });
  // Kişi kanaldan çıktı: sekmesini kapatmış OLABİLİR ya da ayarını değiştirip anahtarı döndürmüş olabilir (yeni kanala geçti). Kısa bir süre sonra
  // kanal adı yeniden sorulur — yetkim sürüyorsa yeni kanala bağlanırım, sürmüyorsa sunucu hiçbir şey vermez. Kişi başına tek bekleyen sorgu.
  if (entry.live === true && live === false && !relookTimers.has(userId)) {
    relookTimers.set(
      userId,
      setTimeout(() => {
        relookTimers.delete(userId);
        const current = entries.get(userId);
        if (!current || !(watched.get(userId)?.count ?? 0)) return;
        entries.set(userId, { ...current, fetchedAt: 0 });
        queueLookup([userId]);
      }, 1200),
    );
  }
  emit();
}

function closeChannel(userId: string) {
  const current = channels.get(userId);
  if (!current) return;
  channels.delete(userId);
  void supabase.removeChannel(current.channel);
  const entry = entries.get(userId);
  if (entry && entry.live !== null) entries.set(userId, { ...entry, live: null });
}

function closeAll() {
  for (const id of [...channels.keys()]) closeChannel(id);
}

function openChannel(userId: string, topic: string) {
  const channel = supabase.channel(topic, { config: { private: true, presence: { key: `viewer-${viewerId ?? "x"}` } } });
  channels.set(userId, { topic, channel });
  channel.on("presence", { event: "sync" }, () => {
    setLive(userId, topic, liveFromPresenceState(channel.presenceState() as Record<string, unknown[]>, userId));
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") failedTopics.delete(topic);
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      if (channels.get(userId)?.channel !== channel) return;
      // Yetki gitti (anahtar döndü / gizlilik daraldı) ya da bağlantı koptu: son görülmeye düş, kanal adını yeniden sor.
      const prev = failedTopics.get(topic);
      const attempts = (prev?.attempts ?? 0) + 1;
      failedTopics.set(topic, { attempts, retryAt: Date.now() + RETRY_STEPS_MS[Math.min(attempts, RETRY_STEPS_MS.length) - 1] });
      scheduleRetry();
      closeChannel(userId);
      const entry = entries.get(userId);
      if (entry) entries.set(userId, { ...entry, fetchedAt: 0 });
      queueLookup([userId]);
      emit();
    }
  });
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  const now = Date.now();
  const next = Math.min(...[...failedTopics.values()].map((f) => f.retryAt).filter((at) => at > now));
  if (!Number.isFinite(next)) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    reconcile();
  }, Math.max(250, next - Date.now()));
}

/** Açık kanalları istenen kümeye getirir: fazlasını kapatır, eksikleri açar, anahtarı değişenleri yeniler. */
function reconcile() {
  // Süresi dolan bırakılmış kayıtlar silinir; süresi dolmayanlar kanal seçiminde izleniyor sayılır.
  const now0 = Date.now();
  const effective = new Map<string, { count: number; lastAt: number }>();
  for (const [id, w] of [...watched.entries()]) {
    if (w.count > 0) effective.set(id, w);
    else if (w.releasedAt !== undefined && now0 - w.releasedAt < RELEASE_DELAY_MS) effective.set(id, { count: 1, lastAt: w.lastAt });
    else watched.delete(id);
  }
  const desired = canRun() && tabActive ? selectLiveIds(effective, entries) : [];
  const want = new Map<string, string>();
  const now = Date.now();
  for (const id of desired) {
    const topic = entries.get(id)?.topic;
    const failed = topic ? failedTopics.get(topic) : undefined;
    if (topic && (!failed || failed.retryAt <= now)) want.set(id, topic);
  }
  if ([...failedTopics.values()].some((f) => f.retryAt > now)) scheduleRetry();
  let changed = false;
  for (const [id, current] of [...channels.entries()]) {
    if (want.get(id) !== current.topic) {
      closeChannel(id);
      changed = true;
    }
  }
  for (const [id, topic] of want) {
    if (!channels.has(id)) openChannel(id, topic);
  }
  if (changed) emit();
}

/** İzlenen herkesin bilgisini tazeler (periyodik; yalnız sekme görünürken çağrılır). `force` = bayat olmasa da. */
export function refreshWatchedPresence(force = false) {
  if (!canRun()) return;
  const ids = [...watched.entries()].filter(([, w]) => w.count > 0).map(([id]) => id);
  if (force) {
    for (const id of ids) {
      const entry = entries.get(id);
      if (entry) entries.set(id, { ...entry, fetchedAt: 0 });
    }
  }
  queueLookup(ids);
  reconcile();
  emit(); // son görülme penceresi zamanla dolar: görünümler yeniden hesaplansın
}

/** Sağlayıcıdan: oturum, özelliğin açıklığı ve izleyicinin kendi gizliliği. */
export function configurePresenceStore(next: { viewerId: string | null; enabled: boolean; selfHidden: boolean }) {
  const changedViewer = next.viewerId !== viewerId;
  const wasRunning = canRun();
  viewerId = next.viewerId;
  enabled = next.enabled;
  selfHidden = next.selfHidden;
  if (changedViewer || !canRun()) {
    closeAll();
    entries.clear();
    pending.clear();
  }
  if (canRun() && (!wasRunning || changedViewer)) {
    queueLookup([...watched.entries()].filter(([, w]) => w.count > 0).map(([id]) => id));
  }
  reconcile();
  emit();
}

/** Sekme görünürlüğü (uzun gizlilikte kanallar kapanır). */
export function setPresenceTabActive(active: boolean) {
  if (tabActive === active) return;
  tabActive = active;
  if (!active) {
    closeAll();
    emit();
  } else {
    refreshWatchedPresence(false);
  }
}

/** Özellik sunucuda yoksa (migration canlıda değil) sağlayıcı da kendi işlerini durdurur. */
export function markPresenceUnavailable() {
  unavailable = true;
  closeAll();
  emit();
}

export function isPresenceUnavailable(): boolean {
  return unavailable;
}

/** Yalnız testler/teşhis için: açık canlı kanal sayısı. */
export function livePresenceChannelCount(): number {
  return channels.size;
}
