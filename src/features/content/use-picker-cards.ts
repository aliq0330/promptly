"use client";

import { useEffect, useRef, useState } from "react";
import { attachmentKey, fetchAttachmentCards, type AttachmentCard, type PickableContent } from "@/lib/supabase/comment-attachments";

/** Seçici satırlarının küçük resimleri: görünen içerikler için TEK sorgu (`fetchAttachmentCards`), her kimlik bir kez sorulur; hata olursa tür simgesi kalır. */
export function usePickerCards(items: PickableContent[] | null) {
  const [cards, setCards] = useState<Map<string, AttachmentCard>>(new Map());
  const asked = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const key = items === null ? "" : items.map(attachmentKey).join("|");
  useEffect(() => {
    if (!items) return;
    const todo = items.filter((item) => !asked.current.has(attachmentKey(item)));
    if (todo.length === 0) return;
    for (const item of todo) asked.current.add(attachmentKey(item));
    fetchAttachmentCards(todo.map(({ type, id }) => ({ type, id })))
      .then(({ cards: got }) => {
        if (!mounted.current || got.size === 0) return;
        setCards((prev) => new Map([...prev, ...got]));
      })
      .catch((err) => console.error("usePickerCards", err));
    // `key` kimlik listesinin özeti: `items` her çizimde yeni dizidir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return cards;
}
