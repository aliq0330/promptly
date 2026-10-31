"use client";

import { useCallback, useEffect, useState } from "react";

/** Anahtar başına 3 dk modül önbelleği: Geri'de ya da dönem değiştirip dönünce yeniden yüklenmez. Kimlik değişince sayfa baştan yüklenir (CLAUDE.md Bölüm 8.10). */
const CACHE_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();

function freshHit<T>(key: string): T | null {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_MS ? (hit.data as T) : null;
}

export type InsightState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; notFound: boolean }
  | { status: "ready"; data: T };

/**
 * Yaratıcı paneli sayfalarının ortak yükleyicisi: `key` değişince yeniden yükler, eski cevap yeni anahtarın üstüne yazmaz.
 * Durum türetilir (önbellek › bu anahtarın sonucu › yükleniyor): efekt içinde eşzamanlı setState yoktur. `isNotFound` hatayı "yok" ekranına ayırır.
 */
export function useInsightData<T>(
  key: string,
  load: () => Promise<T>,
  isNotFound: (error: unknown) => boolean = () => false,
): { state: InsightState<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const runKey = `${key}#${attempt}`;
  const [result, setResult] = useState<{ key: string; state: InsightState<T> } | null>(null);

  useEffect(() => {
    if (freshHit(key)) return;
    let cancelled = false;
    load()
      .then((data) => {
        if (cancelled) return;
        cache.set(key, { at: Date.now(), data });
        setResult({ key: runKey, state: { status: "ready", data } });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({ key: runKey, state: { status: "error", message: error instanceof Error ? error.message : String(error), notFound: isNotFound(error) } });
      });
    return () => {
      cancelled = true;
    };
    // `load`/`isNotFound` her render yeni olabilir; yeniden yükleme yalnız anahtar ya da "tekrar dene" ile olur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, runKey]);

  const retry = useCallback(() => {
    cache.delete(key);
    setAttempt((value) => value + 1);
  }, [key]);

  const hit = freshHit<T>(key);
  const state: InsightState<T> = hit ? { status: "ready", data: hit } : result && result.key === runKey ? result.state : { status: "loading" };
  return { state, retry };
}
