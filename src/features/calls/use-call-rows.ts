"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCallHistory, fetchConversationCalls } from "@/lib/supabase/calls";
import { sortCallsNewestFirst, upsertCall } from "@/lib/webrtc/call-history";
import type { CallRow } from "@/lib/webrtc/types";
import { subscribeCallRows } from "./call-events";

const PAGE = 30;

/**
 * Bitmiş çağrı satırları (docs/history/450-*): `conversationId` verilirse o sohbetin çağrıları (sohbet akışı), verilmezse benim tüm
 * çağrılarım (Aramalar bölümü, imleçli sayfalı). Yeni/biten çağrı `call-events` ile canlı eklenir; hata "boş" sayılmaz (`error`).
 */
export function useCallRows({ userId, conversationId, enabled = true }: { userId: string | null; conversationId?: string | null; enabled?: boolean }) {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadingRef = useRef(false);
  const rowsRef = useRef<CallRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const load = useCallback(
    async (more: boolean) => {
      if (!userId || loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(false);
      try {
        if (conversationId) {
          const page = await fetchConversationCalls(conversationId);
          setRows(sortCallsNewestFirst(page));
          setHasMore(false);
        } else {
          const current = rowsRef.current;
          const before = more && current.length ? current[current.length - 1]!.startedAt : null;
          const page = await fetchCallHistory(userId, before, PAGE);
          setRows((prev) => {
            let next = more ? prev : [];
            for (const row of page) next = upsertCall(next, row, userId);
            return next;
          });
          setHasMore(page.length === PAGE);
        }
      } catch (err) {
        console.error("useCallRows", err);
        setError(true);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [userId, conversationId],
  );

  useEffect(() => {
    if (!enabled || !userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount/değişimde ilk sayfayı sunucudan çeker (yükleniyor durumu burada açılır)
    void load(false);
  }, [enabled, userId, load]);

  useEffect(() => {
    if (!enabled || !userId) return;
    return subscribeCallRows((row) => {
      if (conversationId && row.conversationId !== conversationId) return;
      setRows((prev) => upsertCall(prev, row, userId));
    });
  }, [enabled, userId, conversationId]);

  return { rows, loading, error, hasMore, loadMore: () => load(true), reload: () => load(false) };
}
