"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import {
  fetchMyPresence,
  PresenceUnavailableError,
  sendPresenceHeartbeat,
  setPresenceFocus,
  updateMyPresence,
  type MyPresence,
} from "@/lib/supabase/presence";
import {
  PRESENCE_FOCUS_REFRESH_MS,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_HIDDEN_GRACE_MS,
  PRESENCE_REFRESH_MS,
  isPresenceAudience,
  isPresenceMode,
  isSelfHidden,
  presenceFocusKey,
  shouldTrackSelf,
  type PresenceAudience,
  type PresenceMode,
} from "@/lib/presence";
import { shouldRunNow } from "@/lib/run-throttle";
import { configurePresenceStore, markPresenceUnavailable, refreshWatchedPresence, setPresenceTabActive } from "./presence-store";

/**
 * Çevrimiçi durum sağlayıcısı (docs/history/329-*), `AppProviders`'ta bir kez. Görevleri:
 *  1) Kendi durumum: `my_presence` ile ayar + kanal adı; Otomatik ve kitle "Hiç kimse" değilse kendi private kanalımda track. Görünmez olunca
 *     ÖNCE untrack + kanal kapanır, sonra sunucu anahtarı döndürür (izleyiciler ayrıldığımı anında görür).
 *  2) Son görülme nabzı: sekme görünürken cihaz başına `PRESENCE_HEARTBEAT_MS`'te bir (`shouldRunNow` — çok sekmede tek çağrı); görünmezken
 *     sunucu yazmaz. Nabız güncel ayarı da döndürür: başka cihazdaki değişiklik buraya gelir.
 *  3) Çoklu sekme: ayar değişikliği `BroadcastChannel('promptly-presence')` ile diğer sekmelere iletilir (yoksa `storage` olayı); her sekme
 *     kendi kanal bağlantısını yönetir, aynı anahtarla (kullanıcı kimliği) track ettiği için izleyici tek kişi görür.
 *  4) Görünürlük: sekme `PRESENCE_HIDDEN_GRACE_MS` gizli kalınca untrack + izleme kanalları kapanır; görünür olunca geri.
 *  5) Telegram akıllı bildirimi: açık sayfanın odak anahtarı (yalnız Telegram bildirimi olan kullanıcıda; ilk çağrı false dönerse bu oturumda bir
 *     daha yazılmaz).
 * Sunucuda fonksiyonlar yoksa (migration canlıda değil) her şey sessizce kapanır.
 */

interface PresenceContextValue {
  me: MyPresence | null;
  /** Özellik bu oturumda çalışıyor mu (oturum + sunucu fonksiyonları). */
  available: boolean;
  update: (change: { mode?: PresenceMode; audience?: PresenceAudience }) => Promise<void>;
}

const PresenceContext = createContext<PresenceContextValue>({ me: null, available: false, update: async () => {} });

export function useMyPresence(): PresenceContextValue {
  return useContext(PresenceContext);
}

const BROADCAST_NAME = "promptly-presence";
const STORAGE_EVENT_KEY = "promptly-presence-sync";

type SyncMessage = { type: "settings"; userId: string; mode: PresenceMode; audience: PresenceAudience; topic: string };

function isSyncMessage(value: unknown): value is SyncMessage {
  const v = value as SyncMessage | null;
  return v !== null && typeof v === "object" && v.type === "settings" && typeof v.userId === "string" && isPresenceMode(v.mode) && isPresenceAudience(v.audience) && typeof v.topic === "string";
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Durum kimliğe bağlı tutulur: oturum kapanınca/başka kullanıcıya geçince eski değer hiç okunmaz (effect içinde sıfırlamaya gerek yok).
  const [state, setState] = useState<{ userId: string; me: MyPresence | null; available: boolean } | null>(null);
  const me = state && state.userId === userId ? state.me : null;
  const available = Boolean(state && state.userId === userId && state.available);
  const [active, setActive] = useState(true);
  const selfRef = useRef<{ topic: string; channel: RealtimeChannel } | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const meRef = useRef<MyPresence | null>(null);

  const applyMe = useCallback(
    (next: MyPresence | null) => {
      if (!userId) return;
      const prev = meRef.current;
      if (next && prev && prev.mode === next.mode && prev.audience === next.audience && prev.topic === next.topic) {
        // Yalnız son görülme değişti: yeniden çizim gereksiz.
        meRef.current = next;
        return;
      }
      meRef.current = next;
      setState((current) => ({ userId, me: next, available: current?.userId === userId ? current.available || Boolean(next) : Boolean(next) }));
    },
    [userId],
  );

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof PresenceUnavailableError) {
        if (userId) setState({ userId, me: null, available: false });
        markPresenceUnavailable();
        return true;
      }
      console.error("presence", err);
      return false;
    },
    [userId],
  );

  // 1) Oturum açılınca kendi durumum.
  useEffect(() => {
    meRef.current = null;
    if (!userId) return;
    let cancelled = false;
    fetchMyPresence()
      .then((value) => {
        if (cancelled) return;
        applyMe(value);
      })
      .catch((err) => {
        if (!cancelled) fail(err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, applyMe, fail]);

  // Mağaza: izleyicinin kimliği + karşılıklılık.
  useEffect(() => {
    configurePresenceStore({
      viewerId: userId,
      enabled: Boolean(userId && available && me),
      selfHidden: me ? isSelfHidden(me.mode, me.audience) : true,
    });
  }, [userId, available, me]);

  // 2) Kendi kanalım: yalnız Otomatik + kitle açıkken ve sekme etkinken track.
  useEffect(() => {
    const want = userId && available && me && active && shouldTrackSelf(me.mode, me.audience) ? me.topic : null;
    const current = selfRef.current;
    if (current?.topic === want) return;
    if (current) {
      selfRef.current = null;
      void current.channel.untrack().catch(() => {});
      void supabase.removeChannel(current.channel);
    }
    if (!want || !userId) return;
    const channel = supabase.channel(want, { config: { private: true, presence: { key: userId } } });
    selfRef.current = { topic: want, channel };
    channel.subscribe((status) => {
      // Her (yeniden) bağlanışta yeniden track: Realtime kopup geri gelince izleyiciler kişiyi tekrar görür.
      if (status === "SUBSCRIBED" && selfRef.current?.channel === channel) {
        void channel.track({ at: new Date().toISOString() }).catch(() => {});
      }
    });
  }, [userId, available, me, active]);

  // Sayfadan çıkarken kendi kanalını kapat (izleyiciler anında "ayrıldı" görür).
  useEffect(() => {
    function leave() {
      const current = selfRef.current;
      if (!current) return;
      selfRef.current = null;
      void current.channel.untrack().catch(() => {});
      void supabase.removeChannel(current.channel);
    }
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);

  // 3) Nabız + periyodik yenileme (yalnız görünürken).
  useEffect(() => {
    if (!userId || !available) return;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      if (!shouldRunNow(`presence-hb:${userId}`, PRESENCE_HEARTBEAT_MS)) return;
      sendPresenceHeartbeat()
        .then((value) => {
          if (value) applyMe(value);
        })
        .catch(fail);
    };
    beat();
    const hb = setInterval(beat, 30_000);
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") refreshWatchedPresence(false);
    }, PRESENCE_REFRESH_MS);
    return () => {
      clearInterval(hb);
      clearInterval(refresh);
    };
  }, [userId, available, applyMe, fail]);

  // 4) Görünürlük + ağ geri gelince.
  useEffect(() => {
    if (!userId) return;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (!hiddenTimer) {
          hiddenTimer = setTimeout(() => {
            hiddenTimer = null;
            setActive(false);
            setPresenceTabActive(false);
          }, PRESENCE_HIDDEN_GRACE_MS);
        }
      } else {
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        setActive(true);
        setPresenceTabActive(true);
        if (userId && shouldRunNow(`presence-hb:${userId}`, PRESENCE_HEARTBEAT_MS)) {
          sendPresenceHeartbeat()
            .then((value) => {
              if (value) applyMe(value);
            })
            .catch(fail);
        }
      }
    }
    function onOnline() {
      refreshWatchedPresence(true);
      fetchMyPresence()
        .then((value) => {
          if (value) applyMe(value);
        })
        .catch(fail);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [userId, applyMe, fail]);

  // 5) Çoklu sekme eşitleme.
  useEffect(() => {
    if (!userId) return;
    function receive(data: unknown) {
      if (!isSyncMessage(data) || data.userId !== userId) return;
      applyMe({ mode: data.mode, audience: data.audience, topic: data.topic, lastActiveAt: meRef.current?.lastActiveAt ?? null });
    }
    let bc: BroadcastChannel | null = null;
    try {
      bc = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(BROADCAST_NAME);
    } catch {
      bc = null;
    }
    broadcastRef.current = bc;
    const onMessage = (event: MessageEvent) => receive(event.data);
    bc?.addEventListener("message", onMessage);
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;
      try {
        receive(JSON.parse(event.newValue));
      } catch {
        // bozuk değer: yok say
      }
    }
    window.addEventListener("storage", onStorage);
    return () => {
      bc?.removeEventListener("message", onMessage);
      bc?.close();
      broadcastRef.current = null;
      window.removeEventListener("storage", onStorage);
    };
  }, [userId, applyMe]);

  const update = useCallback(
    async (change: { mode?: PresenceMode; audience?: PresenceAudience }) => {
      if (!userId) return;
      const prev = meRef.current;
      // Gizliliği DARALTAN değişiklikte önce kendi kanalımdan çık (sunucu anahtarı döndürmeden önce izleyiciler ayrıldığımı görsün).
      const current = selfRef.current;
      if (current) {
        selfRef.current = null;
        await current.channel.untrack().catch(() => {});
        void supabase.removeChannel(current.channel);
      }
      try {
        const next = await updateMyPresence(change);
        if (!next) throw new Error("presence_update_failed");
        meRef.current = null; // aynı değerler olsa bile yeniden çiz: kapatılan kendi kanalım yeniden açılsın
        applyMe(next);
        const message: SyncMessage = { type: "settings", userId, mode: next.mode, audience: next.audience, topic: next.topic };
        broadcastRef.current?.postMessage(message);
        try {
          localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify({ ...message, at: Date.now() }));
        } catch {
          // depolama yok: BroadcastChannel yeterli
        }
        refreshWatchedPresence(true);
      } catch (err) {
        // Geri al: eski ayarla yeniden bağlan.
        meRef.current = null;
        applyMe(prev);
        throw err;
      }
    },
    [userId, applyMe],
  );

  const value = useMemo<PresenceContextValue>(() => ({ me, available: available && Boolean(me), update }), [me, available, update]);

  return (
    <PresenceContext.Provider value={value}>
      {userId && available && (
        <Suspense fallback={null}>
          <PresenceFocusTracker userId={userId} />
        </Suspense>
      )}
      {children}
    </PresenceContext.Provider>
  );
}

const FOCUS_OFF_MS = 10 * 60_000;

/**
 * Telegram akıllı bildirimi: kullanıcı bir sayfayı GERÇEKTEN açık tutarken (görünür sekme) o sayfanın odak anahtarını sunucuya yazar; sunucu o
 * içerikle ilgili yeni bildirimi Telegram'a göndermez (sitede yine görünür). Sekme gizlenince/sayfa değişince odak temizlenir/değişir.
 * Telegram bildirimi olmayan kullanıcı için ilk çağrı false döner ve 10 dk boyunca bir daha çağrılmaz (her sayfa yüklemesinde boş istek yok).
 */
function PresenceFocusTracker({ userId }: { userId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const id = params?.get("id") ?? null;
  const key = presenceFocusKey(pathname, id ? `?id=${id}` : "");

  useEffect(() => {
    const offKey = `presence-focus-off:${userId}`;
    try {
      const off = Number(localStorage.getItem(offKey));
      if (Number.isFinite(off) && off > 0 && Date.now() - off < FOCUS_OFF_MS) return;
    } catch {
      // depolama yok: devam
    }
    let stopped = false;
    let sentKey: string | null | undefined;
    function send(next: string | null) {
      if (stopped) return;
      sentKey = next;
      setPresenceFocus(next)
        .then((tracked) => {
          if (!tracked) {
            stopped = true;
            try {
              localStorage.setItem(offKey, String(Date.now()));
            } catch {
              // yok say
            }
          }
        })
        .catch(() => {
          // en iyi çaba: odak yazılamazsa bildirim Telegram'a gider (güvenli varsayılan)
        });
    }
    if (document.visibilityState === "visible") send(key);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") send(key);
    }, PRESENCE_FOCUS_REFRESH_MS);
    function onVisibility() {
      if (document.visibilityState === "visible") send(key);
      else if (sentKey) send(null);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, key]);

  return null;
}
