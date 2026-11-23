"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * Keşfet başlığının altındaki "bu hafta" sayıları (`discover_weekly_stats`, docs/history/451-*). Editoryal bloktan AYRI küçük modül:
 * sayfa bunu hemen okur, ağır editoryal blok ise tembel yüklenir (ilk paket ve hidrasyon hafif kalsın).
 */
export function useWeeklyStats(): { prompts: number; workflows: number; skills: number } | null {
  const [stats, setStats] = useState<{ prompts: number; workflows: number; skills: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("discover_weekly_stats").then(({ data, error }) => {
      if (cancelled || error || !data) return;
      if (typeof data !== "object" || Array.isArray(data)) return;
      const row = data as Record<string, number>;
      setStats({ prompts: Number(row.prompts ?? 0), workflows: Number(row.workflows ?? 0), skills: Number(row.skills ?? 0) });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
