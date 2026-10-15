"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { fetchMessagesByIds, fetchPins, setMessagePinned } from "@/lib/supabase/chat-features";
import type { Message, PinnedMessage } from "@/types";

export interface PinnedItem {
  pin: PinnedMessage;
  message: Message;
}

/**
 * Bir sohbetin sabit mesajları (docs/history/174-*). Sabit yalnızca bir başvurudur (`pinned_messages`); içerik mesajın kendisinden
 * gelir: yüklü sayfadaki mesaj, değilse tek toplu sorguyla çekilir. Mesajı görünmeyen/silinmiş sabit LİSTEYE ALINMAZ (bozuk kayıt
 * gösterilmez; sunucu da mesaj silinince sabiti kaldırır). Başkasının sabitleme/kaldırması Realtime ile gelir → liste yenilenir.
 */
export function usePinnedMessages(conversationId: string | null, viewerId: string | null, loadedMessages: readonly Message[], enabled: boolean) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [extra, setExtra] = useState<Record<string, Message>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!conversationId) return;
    try {
      setPins(await fetchPins(conversationId));
    } catch (err) {
      console.error("fetchPins", err);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!enabled || !conversationId) return;
    let cancelled = false;
    fetchPins(conversationId)
      .then((found) => {
        if (!cancelled) setPins(found);
      })
      .catch((err) => console.error("fetchPins", err))
      .finally(() => {
        if (!cancelled) setLoadedFor(conversationId);
      });
    const scheduleReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void reload(), 250);
    };
    const channel = supabase
      .channel(`pins:${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pinned_messages", filter: `conversation_id=eq.${conversationId}` }, scheduleReload)
      .subscribe();
    return () => {
      cancelled = true;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      void supabase.removeChannel(channel);
      // Başka sohbete geçilince eski sohbetin sabitleri bir an bile gösterilmesin.
      setPins([]);
      setExtra({});
    };
  }, [conversationId, enabled, reload]);

  const loadedById = useMemo(() => new Map(loadedMessages.map((m) => [m.id, m])), [loadedMessages]);

  // Yüklü sayfada olmayan sabitlerin içeriği: yalnız eksik olanlar, bir kez.
  const missingKey = pins
    .map((p) => p.messageId)
    .filter((id) => !loadedById.has(id) && !extra[id])
    .sort()
    .join(",");
  useEffect(() => {
    if (!missingKey || !conversationId || !viewerId) return;
    let cancelled = false;
    fetchMessagesByIds(conversationId, viewerId, missingKey.split(","))
      .then((found) => {
        if (cancelled) return;
        setExtra((prev) => ({ ...prev, ...Object.fromEntries(found.map((m) => [m.id, m])) }));
      })
      .catch((err) => console.error("fetchMessagesByIds (pins)", err));
    return () => {
      cancelled = true;
    };
  }, [missingKey, conversationId, viewerId]);

  const items = useMemo<PinnedItem[]>(
    () =>
      pins
        .map((pin) => ({ pin, message: loadedById.get(pin.messageId) ?? extra[pin.messageId] }))
        .filter((item): item is PinnedItem => Boolean(item.message) && !item.message.deletedAt),
    [pins, loadedById, extra],
  );
  const pinnedIds = useMemo(() => new Set(items.map((item) => item.pin.messageId)), [items]);

  const setPinned = useCallback(
    async (message: Message, pinned: boolean) => {
      await setMessagePinned(message.id, pinned);
      // Sunucu onayından sonra yerel durum; Realtime yankısı aynı sonuca götürür (yineleme yok).
      setPins((prev) =>
        pinned
          ? prev.some((p) => p.messageId === message.id)
            ? prev
            : [{ messageId: message.id, conversationId: message.conversationId, pinnedBy: null, pinnedAt: new Date().toISOString() }, ...prev]
          : prev.filter((p) => p.messageId !== message.id),
      );
      setExtra((prev) => (pinned ? { ...prev, [message.id]: message } : prev));
      void reload();
    },
    [reload],
  );

  return { items, pinnedIds, loading: enabled && Boolean(conversationId) && loadedFor !== conversationId, setPinned, reload };
}
