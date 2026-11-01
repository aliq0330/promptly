"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentState } from "@/features/content/compact-content-card";
import { attachmentKey, fetchAttachmentCards, type AttachmentCard } from "@/lib/supabase/comment-attachments";
import type { CommentAttachment, PromptComment } from "@/types";

/**
 * Yorum listesindeki içerik eklerinin küçük önizleme verisi (docs/history/308-*). Listeye (ilk sayfa, sonraki sayfa, yeni yorum) HER yeni ek
 * girdiğinde, daha önce istenmemiş olanlar tür başına TEK sorguyla toplu okunur — yorum başına ayrı istek yok. Silinmiş yorumun eki istenmez.
 */
export function useAttachmentCards(comments: PromptComment[]) {
  const [cards, setCards] = useState<Map<string, AttachmentCard>>(new Map());
  const [settled, setSettled] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const requested = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const wanted: CommentAttachment[] = [];
    for (const comment of comments) {
      const attachment = comment.attachment;
      if (!attachment || comment.deletedAt) continue;
      const key = attachmentKey(attachment);
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      wanted.push(attachment);
    }
    if (wanted.length === 0) return;
    // Liste bu arada değişse de istek tamamlanır (anahtarlar zaten "istenmiş" sayıldı); yalnız bileşen kalkınca sonuç atılır.
    fetchAttachmentCards(wanted).then((result) => {
      if (!mounted.current) return;
      setCards((prev) => new Map([...prev, ...result.cards]));
      setSettled((prev) => new Set([...prev, ...wanted.map(attachmentKey)]));
      setFailed((prev) => new Set([...prev, ...wanted.filter((item) => result.failed.has(item.type)).map(attachmentKey)]));
    });
  }, [comments]);

  /** Bir ekin o anki hâli: henüz okunmadıysa `loading`, okundu ama dönmediyse `hidden` (okuyamıyor/kaldırıldı), tür sorgusu çöktüyse `error`. */
  const stateFor = useCallback(
    (attachment: CommentAttachment): AttachmentState => {
      const key = attachmentKey(attachment);
      const card = cards.get(key);
      if (card) return { status: "ready", card };
      if (failed.has(key)) return { status: "error" };
      return settled.has(key) ? { status: "hidden" } : { status: "loading" };
    },
    [cards, failed, settled],
  );

  return { stateFor };
}
