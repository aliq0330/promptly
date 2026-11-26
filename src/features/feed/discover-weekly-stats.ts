"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type WeeklyStats = { prompts: number; workflows: number; skills: number };

/** 3 dk modül önbelleği + uçuştaki isteği paylaşma (docs/history/465-*): sayfa yeniden bağlandığında ya da Geri'de yeniden sorulmaz. */
const TTL_MS = 3 * 60 * 1000;
let cache: { value: WeeklyStats; at: number } | null = null;
let inflight: Promise<WeeklyStats | null> | null = null;

function loadWeeklyStats(): Promise<WeeklyStats | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.value);
  if (inflight) return inflight;
  inflight = Promise.resolve(supabase.rpc("discover_weekly_stats"))
    .then(({ data, error }) => {
      if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
      const row = data as Record<string, number>;
      const value = { prompts: Number(row.prompts ?? 0), workflows: Number(row.workflows ?? 0), skills: Number(row.skills ?? 0) };
      cache = { value, at: Date.now() };
      return value;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Keşfet başlığının altındaki "bu hafta" sayıları (`discover_weekly_stats`, docs/history/451-*). Editoryal bloktan AYRI küçük modül:
 * sayfa bunu hemen okur, ağır editoryal blok ise tembel yüklenir (ilk paket ve hidrasyon hafif kalsın).
 */
export function useWeeklyStats(): WeeklyStats | null {
  const [stats, setStats] = useState<WeeklyStats | null>(() => (cache && Date.now() - cache.at < TTL_MS ? cache.value : null));
  useEffect(() => {
    let cancelled = false;
    void loadWeeklyStats().then((value) => {
      if (!cancelled && value) setStats(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
