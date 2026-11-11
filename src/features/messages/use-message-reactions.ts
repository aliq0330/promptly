"use client";

/**
 * Açık sohbetin mesaj tepkileri (docs/history/330-*): tek düz liste + canlı abonelik + iyimser "tek tepki" kuralı.
 * `LocalConversationView`'dan davranış değiştirmeden ayrıldı (docs/history/372-*). İlk yükleme sohbetin toplu
 * yüklemesiyle birlikte yapılır ve `setReactionRows` ile verilir (ayrı istek yok); "sohbeti temizle" de onu boşaltır.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  reactionRowFromDb,
  removeMessageReaction,
  setMessageReaction,
  type MessageReactionRow,
  type RawReactionRow,
} from "@/lib/supabase/message-reactions";
import type { ReactionKey } from "@/lib/reactions";
import type { MessageReactionEntry } from "./message-bubble";
import { removeReactionRow, upsertReaction } from "./realtime-helpers";

export function useMessageReactions(conversationId: string | null | undefined, userId: string | null | undefined) {
  const [reactionRows, setReactionRows] = useState<MessageReactionRow[]>([]);

  // Aynı Realtime deseni, tepkiler için (Aşama 2/6 — "tepki ekleme, değiştirme ve kaldırma gerçek zamanlı olarak karşı tarafa
  // yansıtılmalı"). Ekleme/değiştirme aynı satırın UPSERT'i olduğundan (aynı birincil anahtar `(message_id, user_id)`) ikisi de
  // tek bir INSERT-veya-UPDATE olayı üretiyor; DELETE, `REPLICA IDENTITY FULL` sayesinde (migration'daki not)
  // `conversation_id` filtresini gerçekten değerlendirebiliyor.
  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase
      .channel(`message_reactions:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = reactionRowFromDb(payload.new as RawReactionRow);
          if (row) setReactionRows((prev) => upsertReaction(prev, row));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = reactionRowFromDb(payload.new as RawReactionRow);
          if (row) setReactionRows((prev) => upsertReaction(prev, row));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.old as { message_id: string; user_id: string };
          setReactionRows((prev) => removeReactionRow(prev, row.message_id, row.user_id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, MessageReactionEntry[]>();
    for (const row of reactionRows) {
      const entries = map.get(row.messageId) ?? [];
      entries.push({ userId: row.userId, reaction: row.reaction });
      map.set(row.messageId, entries);
    }
    return map;
  }, [reactionRows]);

  // Aşama 2's "tek tepki" kuralı (tepkiler gönderidekiyle aynı altı tepki, docs/history/330-*): aynı tepkiye tekrar basmak tepkiyi
  // kaldırır, farklı bir tepki seçmek eskisinin yerini alır — ikisi de optimistik olarak uygulanıp başarısızlıkta geri alınıyor
  // (Follow/Like/Save provider'larından beri bu projenin standart deseni).
  async function handleReact(messageId: string, reaction: ReactionKey) {
    if (!userId || !conversationId) return;
    const mine = reactionRows.find((r) => r.messageId === messageId && r.userId === userId);
    if (mine && mine.reaction === reaction) {
      setReactionRows((prev) => removeReactionRow(prev, messageId, userId));
      try {
        await removeMessageReaction(messageId, userId);
      } catch (err) {
        console.error("removeMessageReaction", err);
        setReactionRows((prev) => upsertReaction(prev, mine));
      }
      return;
    }
    const previous = mine;
    setReactionRows((prev) => upsertReaction(prev, { messageId, userId, reaction }));
    try {
      await setMessageReaction(messageId, conversationId, userId, reaction);
    } catch (err) {
      console.error("setMessageReaction", err);
      setReactionRows((prev) => (previous ? upsertReaction(prev, previous) : removeReactionRow(prev, messageId, userId)));
    }
  }

  return { setReactionRows, reactionsByMessage, handleReact };
}
