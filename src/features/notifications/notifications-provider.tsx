"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  deleteAllNotifications,
  deleteCard,
  dispatchMyWeeklyDigest,
  fetchSnoozeSummary,
  fetchUnreadCardCount,
  fetchUnreadCountsByCategory,
  markCardRead,
  markCardUnread,
  snoozeCard,
  unsnoozeCard,
} from "@/lib/supabase/notifications";
import { supabase } from "@/lib/supabase/client";
import { dispatchMyEventReminders } from "@/lib/supabase/communities";
import { clearThrottle, shouldRunNow } from "@/lib/run-throttle";
import { announceNotice } from "@/lib/app-notice";
import { applyMute } from "./mute-store";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { NotificationCategoryName } from "@/lib/notification-mirror";
import type { NotificationCard } from "@/types";

/** Etkinlik hatırlatması penceresi 24 saat; 30 dakikalık gecikme zararsızdır. */
const EVENT_REMINDER_INTERVAL_MS = 30 * 60 * 1000;
/** Haftalık özet sunucuda haftada bir; 6 saatte bir sormak yeter. */
const WEEKLY_DIGEST_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Silme, "Geri al" şeridi süresince bekletilir; süre dolunca sunucuda gerçekten silinir. */
export const UNDO_WINDOW_MS = 5000;

/** Kart listelerinin (zil paneli, /notifications) dinlediği iyimser olaylar: her açık liste aynı değişikliği kendi durumuna uygular. */
export type CardEvent =
  | { type: "read"; key: string; read: boolean }
  | { type: "remove"; key: string }
  | { type: "restore"; card: NotificationCard }
  | { type: "readAll" }
  | { type: "clear" };

/** Alttaki tek "Geri al" şeridi (aynı anda tek eylem geri alınabilir). */
export interface UndoNotice {
  id: number;
  text: string;
  undo: () => Promise<void> | void;
}

interface NotificationsContextValue {
  /** Zil rozeti: okunmamış satırı olan KART sayısı (veritabanı sayar). */
  unreadCount: number;
  /** Ertelenen kart sayısı ("Ertelenenler" menü öğesi). */
  snoozedCount: number;
  /** Gerçek zamanlı gelen yeni bildirim sayısı (listeler "N yeni" hapını bundan çıkarır; yalnız artar). */
  incoming: number;
  loadCategoryCounts: () => Promise<Partial<Record<NotificationCategoryName, number>>>;
  refreshCounters: () => Promise<void>;
  subscribe: (listener: (event: CardEvent) => void) => () => void;
  markRead: (card: NotificationCard) => Promise<void>;
  markUnread: (card: NotificationCard) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Hepsini veritabanından siler; başarısızsa fırlatır. */
  clearAll: () => Promise<void>;
  /** Kartı listeden çıkarır; "Geri al" süresi dolunca sunucuda siler. */
  remove: (card: NotificationCard) => void;
  snooze: (card: NotificationCard, until: Date, label: string) => Promise<void>;
  unsnooze: (card: NotificationCard) => Promise<void>;
  mute: (kind: "actor" | "content", target: string, label: string, text: string) => Promise<void>;
  /** Sesini açar (sessize almanın tersi); "Geri al" şeridi tekrar sessize alır. */
  unmute: (kind: "actor" | "content", target: string, label: string, text: string) => Promise<void>;
  undoNotice: UndoNotice | null;
  pushUndo: (text: string, undo: () => Promise<void> | void) => void;
  runUndo: () => Promise<void>;
  dismissUndo: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Bildirim merkezinin ortak durumu (docs/history/326-*): zil rozeti, ertelenenler, gerçek zamanlı "yeni var" sayacı, kart eylemleri (iyimser + geri al) ve
 * tek "Geri al" şeridi. Kartların KENDİ listesi burada değil, `useNotificationCards`'tadır (zil paneli ve sayfa ayrı süzgeçlerle okuyabilsin diye);
 * bu sağlayıcı yalnız sayaçları tutar ve listelere olay yayar. Açılışta yalnız iki ucuz sayım RPC'si çalışır (docs/history/325-*: açılışta liste çekilmez).
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [unread, setUnread] = useState(0);
  const [snoozed, setSnoozed] = useState(0);
  const [incoming, setIncoming] = useState(0);
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const listeners = useRef(new Set<(event: CardEvent) => void>());
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoSeq = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeletes = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; card: NotificationCard }>());
  const lastVisibleRefresh = useRef(0);
  // Uyanma zamanlayıcısı kendi fonksiyonunu çağırır; kendine başvuru yerine güncel sürüme ref üzerinden ulaşır.
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const emit = useCallback((event: CardEvent) => {
    listeners.current.forEach((listener) => listener(event));
  }, []);

  const subscribe = useCallback((listener: (event: CardEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const refreshCounters = useCallback(async () => {
    if (!user) return;
    const [count, summary] = await Promise.all([fetchUnreadCardCount(), fetchSnoozeSummary()]);
    if (count !== null) setUnread(count);
    setSnoozed(summary.groups);
    // En yakın erteleme dolunca kartın geri geldiğini haber ver: tek zamanlayıcı (≈ 24 gün üst sınırı setTimeout'un 32 bit sınırı içinde kalır).
    if (wakeTimer.current) clearTimeout(wakeTimer.current);
    wakeTimer.current = null;
    if (summary.nextWake) {
      const delay = Math.min(Math.max(new Date(summary.nextWake).getTime() - Date.now() + 500, 1000), 2_000_000_000);
      wakeTimer.current = setTimeout(() => {
        setIncoming((n) => n + 1);
        void refreshRef.current();
      }, delay);
    }
  }, [user]);

  useEffect(() => {
    refreshRef.current = refreshCounters;
  }, [refreshCounters]);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- signed out, nothing to count
      setUnread(0);
      setSnoozed(0);
      return;
    }
    let cancelled = false;
    void refreshCounters();
    // Topluluk etkinlik hatırlatmaları (docs/history/175-*) ve haftalık özet (docs/history/307-*): zamanlayıcı yok, uygulama açılışında sunucu
    // en çok bir kez bildirim üretir; yeni bildirim oluştuysa sayaç yenilenir. Hata bildirimleri etkilemez; aralık cihaz başınadır (docs/history/325-*).
    const reminderKey = `promptly-throttle:event-reminders:${user.id}`;
    if (shouldRunNow(reminderKey, EVENT_REMINDER_INTERVAL_MS)) {
      dispatchMyEventReminders()
        .then((created) => {
          if (created > 0 && !cancelled) {
            setIncoming((n) => n + 1);
            return refreshCounters();
          }
        })
        .catch(() => clearThrottle(reminderKey));
    }
    const digestKey = `promptly-throttle:weekly-digest:${user.id}`;
    if (shouldRunNow(digestKey, WEEKLY_DIGEST_INTERVAL_MS)) {
      dispatchMyWeeklyDigest()
        .then((created) => {
          if (created > 0 && !cancelled) {
            setIncoming((n) => n + 1);
            return refreshCounters();
          }
        })
        .catch(() => clearThrottle(digestKey));
    }
    return () => {
      cancelled = true;
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
    };
  }, [user, refreshCounters]);

  // Gerçek zamanlı: `notifications` tablosu `supabase_realtime` yayınında. INSERT = yeni bildirim (listeler yeniden dizmez, "N yeni" der);
  // UPDATE/DELETE (başka cihaz ya da kendi yazımızın yankısı) yalnız sayaçları tazeler — listeyi değil, böylece iyimser değişiklik titremez.
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "INSERT") setIncoming((n) => n + 1);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refreshCounters(), 400);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user, refreshCounters]);

  // Sekme yeniden görününce (ertelemeler dolmuş, başka cihazda okunmuş olabilir) sayaçları tazele.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastVisibleRefresh.current < 10_000) return;
      lastVisibleRefresh.current = Date.now();
      void refreshCounters();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, refreshCounters]);

  const loadCategoryCounts = useCallback(() => fetchUnreadCountsByCategory(), []);

  const dismissUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndoNotice(null);
  }, []);

  const pushUndo = useCallback((text: string, undo: () => Promise<void> | void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoSeq.current += 1;
    const id = undoSeq.current;
    setUndoNotice({ id, text, undo });
    undoTimer.current = setTimeout(() => setUndoNotice((current) => (current?.id === id ? null : current)), UNDO_WINDOW_MS);
  }, []);

  const runUndo = useCallback(async () => {
    const current = undoNotice;
    dismissUndo();
    if (!current) return;
    try {
      await current.undo();
    } catch (err) {
      console.error("undo", err);
      announceNotice(t("nc.undoFailed"));
    }
  }, [undoNotice, dismissUndo, t]);

  // Silme "Geri al" süresi dolunca gerçekten yapılır; sayfa gizlenirken/kapanırken bekleyenler hemen gönderilir.
  const flushDelete = useCallback(
    async (key: string) => {
      const entry = pendingDeletes.current.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      pendingDeletes.current.delete(key);
      try {
        await deleteCard(key);
        void refreshCounters();
      } catch (err) {
        console.error("delete notification", err);
        announceNotice(t("nc.deleteFailed"));
        emit({ type: "restore", card: entry.card });
        void refreshCounters();
      }
    },
    [emit, refreshCounters, t],
  );

  useEffect(() => {
    const flushAll = () => {
      for (const key of [...pendingDeletes.current.keys()]) void flushDelete(key);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, [flushDelete]);

  const markRead = useCallback(
    async (card: NotificationCard) => {
      if (card.unreadCount === 0) return;
      emit({ type: "read", key: card.key, read: true });
      setUnread((n) => Math.max(0, n - 1));
      try {
        await markCardRead(card.key);
      } catch (err) {
        console.error("markRead", err);
        emit({ type: "read", key: card.key, read: false });
        setUnread((n) => n + 1);
        announceNotice(t("nc.actionFailed"));
      }
    },
    [emit, t],
  );

  const markUnread = useCallback(
    async (card: NotificationCard) => {
      emit({ type: "read", key: card.key, read: false });
      setUnread((n) => n + 1);
      try {
        await markCardUnread(card.key);
      } catch (err) {
        console.error("markUnread", err);
        emit({ type: "read", key: card.key, read: true });
        setUnread((n) => Math.max(0, n - 1));
        announceNotice(t("nc.actionFailed"));
      }
    },
    [emit, t],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const previous = unread;
    emit({ type: "readAll" });
    setUnread(0);
    try {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", user.id).eq("is_read", false);
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error("markAllRead", err);
      setUnread(previous);
      announceNotice(t("nc.actionFailed"));
      void refreshCounters();
    }
  }, [user, unread, emit, refreshCounters, t]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await deleteAllNotifications(user.id);
    emit({ type: "clear" });
    setUnread(0);
    setSnoozed(0);
  }, [user, emit]);

  const remove = useCallback(
    (card: NotificationCard) => {
      emit({ type: "remove", key: card.key });
      if (card.unreadCount > 0) setUnread((n) => Math.max(0, n - 1));
      const timer = setTimeout(() => void flushDelete(card.key), UNDO_WINDOW_MS);
      pendingDeletes.current.set(card.key, { timer, card });
      pushUndo(t("nc.deleted"), () => {
        const entry = pendingDeletes.current.get(card.key);
        if (!entry) return;
        clearTimeout(entry.timer);
        pendingDeletes.current.delete(card.key);
        emit({ type: "restore", card });
        if (card.unreadCount > 0) setUnread((n) => n + 1);
      });
    },
    [emit, flushDelete, pushUndo, t],
  );

  const unsnooze = useCallback(
    async (card: NotificationCard) => {
      await unsnoozeCard(card.key);
      emit({ type: "remove", key: card.key });
      await refreshCounters();
    },
    [emit, refreshCounters],
  );

  const snooze = useCallback(
    async (card: NotificationCard, until: Date, label: string) => {
      try {
        await snoozeCard(card.key, until);
      } catch (err) {
        console.error("snooze", err);
        announceNotice(t("nc.actionFailed"));
        return;
      }
      emit({ type: "remove", key: card.key });
      if (card.unreadCount > 0) setUnread((n) => Math.max(0, n - 1));
      void refreshCounters();
      pushUndo(label, async () => {
        await unsnoozeCard(card.key);
        emit({ type: "restore", card });
        await refreshCounters();
      });
    },
    [emit, pushUndo, refreshCounters, t],
  );

  const mute = useCallback(
    async (kind: "actor" | "content", target: string, label: string, text: string) => {
      try {
        await applyMute(kind, target, label, true);
      } catch (err) {
        console.error("mute", err);
        announceNotice(t("nc.actionFailed"));
        return;
      }
      pushUndo(text, () => applyMute(kind, target, label, false));
    },
    [pushUndo, t],
  );

  const unmute = useCallback(
    async (kind: "actor" | "content", target: string, label: string, text: string) => {
      try {
        await applyMute(kind, target, label, false);
      } catch (err) {
        console.error("unmute", err);
        announceNotice(t("nc.actionFailed"));
        return;
      }
      pushUndo(text, () => applyMute(kind, target, label, true));
    },
    [pushUndo, t],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      unreadCount: unread,
      snoozedCount: snoozed,
      incoming,
      loadCategoryCounts,
      refreshCounters,
      subscribe,
      markRead,
      markUnread,
      markAllRead,
      clearAll,
      remove,
      snooze,
      unsnooze,
      mute,
      unmute,
      undoNotice,
      pushUndo,
      runUndo,
      dismissUndo,
    }),
    [unread, snoozed, incoming, loadCategoryCounts, refreshCounters, subscribe, markRead, markUnread, markAllRead, clearAll, remove, snooze, unsnooze, mute, unmute, undoNotice, pushUndo, runUndo, dismissUndo],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
