"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCreatorInsights, type CreatorInsights } from "@/lib/supabase/insights";

/** Dönem başına 3 dk modül önbelleği: Geri'de ya da dönem değiştirip dönünce yeniden yüklenmez. Kimlik değişince sayfa baştan yüklenir (CLAUDE.md Bölüm 8.10). */
const CACHE_MS = 3 * 60 * 1000;
const cache = new Map<number, { at: number; data: CreatorInsights }>();

function freshHit(days: number): CreatorInsights | null {
  const hit = cache.get(days);
  return hit && Date.now() - hit.at < CACHE_MS ? hit.data : null;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CreatorInsights };

/**
 * Tek `Promise.all` ile dört RPC; `days` değişince yeniden yükler, eski cevap yeni dönemin üstüne yazmaz.
 * Durum türetilir (önbellek › bu dönemin sonucu › yükleniyor): efekt içinde eşzamanlı setState yoktur.
 */
export function useCreatorInsights(days: number): { state: State; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${days}:${attempt}`;
  const [result, setResult] = useState<{ key: string; state: State } | null>(null);

  useEffect(() => {
    if (freshHit(days)) return;
    let cancelled = false;
    fetchCreatorInsights(days)
      .then((data) => {
        if (cancelled) return;
        cache.set(days, { at: Date.now(), data });
        setResult({ key, state: { status: "ready", data } });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({ key, state: { status: "error", message: error instanceof Error ? error.message : String(error) } });
      });
    return () => {
      cancelled = true;
    };
  }, [days, key]);

  const retry = useCallback(() => {
    cache.delete(days);
    setAttempt((value) => value + 1);
  }, [days]);

  const hit = freshHit(days);
  const state: State = hit ? { status: "ready", data: hit } : result && result.key === key ? result.state : { status: "loading" };
  return { state, retry };
}
