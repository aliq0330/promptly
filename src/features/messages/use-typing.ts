"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { shouldSendTyping, TYPING_IDLE_MS, TypingTracker, typingTopic } from "@/lib/chat-features";

/**
 * "Yazıyor…" göstergesi (docs/history/174-*): Supabase Realtime **Broadcast** üzerinden, KALICI DEĞİL — hiçbir şey veritabanına
 * yazılmaz. Kanal `typing:<konuşma>` ve PRIVATE'tır: Realtime Authorization politikaları (`can_use_typing_topic`) yalnız konuşma
 * üyelerine okuma/yazma izni verir; üye olmayan ya da gruptan çıkarılan biri kanala hiç katılamaz.
 *
 * Gönderen: tuş vuruşunda en sık `TYPING_SEND_INTERVAL_MS`'te bir sinyal; durunca, gönderince, ekrandan çıkınca ya da sekme
 * gizlenince "bıraktı" sinyali. Alıcı: her sinyal `TYPING_EXPIRE_MS` geçerlidir; yenisi gelmezse (karşı taraf çevrimdışı kaldıysa)
 * gösterge kendiliğinden söner. Kanal hatası/kopma gösterge dışında hiçbir şeyi etkilemez (sessizce kapanır).
 *
 * NOT: Broadcast yükündeki `userId` göndericinin beyanıdır (Realtime üye kimliğini yüke eklemez); yetkilendirme yalnız üyelik
 * düzeyindedir. Kötü niyetli bir üye başka bir üye adına "yazıyor" gösterebilir — yalnızca bir kozmetik göstergeyi etkiler.
 */
export function useTyping({
  conversationId,
  userId,
  enabled,
  canSend,
}: {
  conversationId: string | null;
  userId: string | null;
  /** Kanalı hiç açma (oturum yok, sohbet yüklenmedi, üyelik bitti...). */
  enabled: boolean;
  /** Bu kullanıcı sinyal GÖNDEREBİLİR mi (bekleyen istekte, engelliyken ya da yazamıyorsa gönderilmez; alma sürer). */
  canSend: boolean;
}) {
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const lastSentRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canSendRef = useRef(canSend);

  useEffect(() => {
    canSendRef.current = canSend;
  }, [canSend]);

  const send = useCallback(
    (typing: boolean) => {
      const channel = channelRef.current;
      if (!channel || !subscribedRef.current || !userId) return;
      channel.send({ type: "broadcast", event: "typing", payload: { userId, typing } }).catch(() => {
        /* geçici ağ hatası: gösterge kaybolur, başka bir şey etkilenmez */
      });
    },
    [userId],
  );

  const stopTyping = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (lastSentRef.current !== null) {
      lastSentRef.current = null;
      send(false);
    }
  }, [send]);

  const notifyTyping = useCallback(() => {
    if (!canSendRef.current) return;
    const now = Date.now();
    if (shouldSendTyping(lastSentRef.current, now)) {
      lastSentRef.current = now;
      send(true);
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }, [send, stopTyping]);

  useEffect(() => {
    if (!enabled || !conversationId || !userId) return;

    const tracker = new TypingTracker();
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;

    function publish() {
      const now = Date.now();
      setTypingIds(tracker.active(now));
      if (expiryTimer) clearTimeout(expiryTimer);
      const next = tracker.nextExpiryIn(now);
      expiryTimer = next === null ? null : setTimeout(publish, next + 20);
    }

    const channel = supabase
      .channel(typingTopic(conversationId), { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const body = payload as { userId?: unknown; typing?: unknown } | null;
        if (!body || typeof body.userId !== "string" || body.userId === userId) return;
        if (body.typing === false) tracker.stop(body.userId);
        else tracker.receive(body.userId, Date.now());
        publish();
      });
    channelRef.current = channel;

    channel.subscribe((status) => {
      subscribedRef.current = status === "SUBSCRIBED";
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        tracker.clear();
        publish();
      }
    });

    function handleHidden() {
      if (document.visibilityState === "hidden") stopTyping();
    }
    document.addEventListener("visibilitychange", handleHidden);
    window.addEventListener("pagehide", stopTyping);

    return () => {
      document.removeEventListener("visibilitychange", handleHidden);
      window.removeEventListener("pagehide", stopTyping);
      stopTyping();
      if (expiryTimer) clearTimeout(expiryTimer);
      tracker.clear();
      subscribedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setTypingIds([]);
    };
  }, [enabled, conversationId, userId, stopTyping]);

  return { typingIds, notifyTyping, stopTyping };
}
