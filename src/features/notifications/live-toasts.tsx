"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { useMessageDock } from "@/features/messages/message-dock-provider";
import { getLiveNotifyPrefs, useLiveToastsEnabled } from "./live-toast-pref";
import { LiveToast } from "./live-toast-item";
import { ensureQuietHours, isQuietHoursNow } from "./quiet-hours-store";
import { useNotifications } from "./notifications-provider";
import { useMinWidth } from "./use-min-width";
import { fetchProfilesByIds } from "@/lib/supabase/chat-groups";
import { fetchIsFollowing } from "@/lib/supabase/follows";
import {
  LIVE_TOAST_EXIT_MS,
  addLiveToast,
  addSummaryToast,
  dropLiveToast,
  leaveLiveToast,
  liveToastAction,
  liveToastSkipReason,
  toastCardFromRow,
  type IncomingNotificationRow,
  type LiveToastContext,
  type LiveToastEntry,
} from "@/lib/live-notification-toast";
import { isBurst, liveToastGroupOf, pushArrival } from "@/lib/live-notification-prefs";
import { playNotificationChime } from "@/lib/notification-sound";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

/** Aktör profilleri oturum boyu önbellekte tutulur: aynı kişiden art arda gelen bildirimlerde her seferinde profil sorgusu yapılmaz. */
const actorCache = new Map<string, Promise<UserProfile | null>>();
function resolveActor(id: string): Promise<UserProfile | null> {
  let hit = actorCache.get(id);
  if (!hit) {
    hit = fetchProfilesByIds([id]).then((rows) => rows[0] ?? null);
    actorCache.set(id, hit);
  }
  return hit;
}

/**
 * Canlı bildirim kartı (docs/history/434-*, 435-*): sitedeyken yeni bir bildirim gelince üst köşede kısa bir önizleme kartı çıkar ve birkaç saniye sonra kendiliğinden
 * kapanır. Bilgisayarda (≥ md) zil/üst çubuğun altında sağ üstte kayarak gelir; telefonda üstten iner, yukarı kaydırınca kapanır. Üstüne gelince ya da basılı
 * tutunca süre durur; kartın altındaki çizgi kalan süreyi gösterir. Aynı içeriğe gelen beğeni/takipler tek kartta birleşir ("Ali ve 2 kişi daha"), ekranda en
 * çok 3 kart durur; kısa sürede çok bildirim gelirse (yoğunluk) kartlar tek bir özet kartına iner. Kart yalnız gelen satırı gösterir: bildirimi yazan/gruplayan/sessize
 * alan sunucudur (sessize alınmış ya da türü kapatılmış bildirim hiç gelmez), kapanması gelen kutusunu etkilemez. Çıkmaz: bildirimler sayfasında, o sohbette, yazma ekranı/
 * hikâye/zil paneli açıkken, sekme arka plandayken, kapatılmış tür grubunda ve Rahatsız etme saatinde (`liveToastSkipReason`). Ses (isteğe bağlı) yalnız kart çıktığında çalar.
 * Ayarlar → Bildirimler (`live-toast-pref.ts`, `quiet-hours-store.ts`).
 */
export function LiveNotificationToasts() {
  const { user } = useAuth();
  const { subscribeIncoming } = useNotifications();
  const enabled = useLiveToastsEnabled();
  const wide = useMinWidth(768);
  const pathname = usePathname() ?? "";
  const dock = useMessageDock();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LiveToastEntry[]>([]);
  const userId = user?.id ?? null;
  const active = Boolean(userId) && enabled;

  // Kapatılınca (ya da çıkış yapılınca) ekrandaki kartlar hemen kalkar; açık kalmış zamanlayıcı yok.
  if (!active && entries.length > 0) setEntries([]);

  const dockConversationId = dock.open && dock.view.kind === "chat" ? dock.view.conversationId : null;
  const where = useRef({ pathname, dockConversationId });
  useEffect(() => {
    where.current = { pathname, dockConversationId };
  }, [pathname, dockConversationId]);

  // Sessiz saatler hesap başınadır (veritabanı): etkinken bir kez okunur, sekme yeniden görününce (10 dk'dan eskiyse) tazelenir.
  useEffect(() => {
    if (!active) return;
    void ensureQuietHours();
    const onVisible = () => {
      if (document.visibilityState === "visible") void ensureQuietHours();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active]);

  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  const arrivals = useRef<number[]>([]);
  useEffect(() => {
    if (!active || !userId) return;
    return subscribeIncoming((row: IncomingNotificationRow) => {
      const root = document.documentElement;
      const prefs = getLiveNotifyPrefs();
      const ctx: LiveToastContext = {
        pathname: where.current.pathname,
        search: window.location.search,
        visible: document.visibilityState === "visible",
        composeOpen: root.hasAttribute("data-compose-open"),
        storyOpen: root.hasAttribute("data-story-open"),
        popoverOpen: Boolean(document.querySelector("[data-notification-popover]")),
        dockConversationId: where.current.dockConversationId,
        groupEnabled: prefs.types[liveToastGroupOf(row.type)],
        quiet: isQuietHoursNow(),
      };
      if (liveToastSkipReason(row, ctx)) return;
      arrivals.current = pushArrival(arrivals.current, Date.now());
      const burst = isBurst(arrivals.current);
      const burstSize = arrivals.current.length;
      void (async () => {
        const actor = row.actorId ? await resolveActor(row.actorId).catch(() => null) : null;
        if (burst) {
          // Yoğunluk: kartlar tek özet kartına iner; ses yalnız özet İLK çıktığında (her artışta değil).
          const created = !entriesRef.current.some((entry) => entry.summary && !entry.leaving);
          setEntries((prev) => addSummaryToast(prev, burstSize, actor ? [actor] : [], `summary-${row.id}`));
          if (prefs.sound && created) playNotificationChime();
          return;
        }
        const card = toastCardFromRow(row, actor);
        let canFollow = false;
        if (liveToastAction(card) === "follow" && actor && actor.id !== userId) canFollow = !(await fetchIsFollowing(userId, actor.id).catch(() => true));
        setEntries((prev) => addLiveToast(prev, card, canFollow));
        if (prefs.sound) playNotificationChime();
      })();
    });
  }, [active, userId, subscribeIncoming]);

  const close = useCallback((id: string) => setEntries((prev) => leaveLiveToast(prev, id)), []);

  // Kapanmaya alınan her kart (süre doldu, ✕, kaydırma, yer açma) animasyon bitince DOM'dan kalkar.
  const scheduledDrops = useRef(new Set<string>());
  useEffect(() => {
    for (const entry of entries) {
      if (!entry.leaving || scheduledDrops.current.has(entry.id)) continue;
      scheduledDrops.current.add(entry.id);
      window.setTimeout(() => {
        scheduledDrops.current.delete(entry.id);
        setEntries((prev) => dropLiveToast(prev, entry.id));
      }, LIVE_TOAST_EXIT_MS);
    }
  }, [entries]);

  if (!active || entries.length === 0) return null;
  return (
    <div
      role="region"
      aria-label={t("nc.live.region")}
      aria-live="polite"
      data-live-toasts={wide ? "desk" : "phone"}
      className="pointer-events-none fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-(--z-toast) flex flex-col md:inset-x-auto md:right-6 md:top-[4.5rem] md:w-[21.25rem] lg:right-8"
    >
      {entries.map((entry) => (
        <LiveToast key={entry.id} entry={entry} mode={wide ? "desk" : "phone"} onClose={close} />
      ))}
    </div>
  );
}
