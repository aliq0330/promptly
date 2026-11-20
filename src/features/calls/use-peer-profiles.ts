"use client";

import { useEffect, useState } from "react";
import { fetchProfilesByIds } from "@/lib/supabase/chat-groups";
import type { CallPeerInfo } from "@/lib/webrtc/types";

/** Kimlik → kişi bilgisi önbelleği (modül düzeyi): Aramalar listesi aynı kişiyi tekrar sormaz. */
const cache = new Map<string, CallPeerInfo>();

/** Verilen kimliklerin profillerini toplu çözer (100'erli parça); bulunamayan kişi `null` kalır (silinmiş hesap). */
export function usePeerProfiles(ids: readonly string[]): ReadonlyMap<string, CallPeerInfo> {
  const [, bump] = useState(0);
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    const missing = key ? key.split(",").filter((id) => !cache.has(id)) : [];
    if (missing.length === 0) return;
    let alive = true;
    void (async () => {
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const profiles = await fetchProfilesByIds(chunk);
        for (const p of profiles) cache.set(p.id, { id: p.id, displayName: p.displayName, username: p.username, avatarUrl: p.avatarUrl ?? null });
      }
      if (alive) bump((n) => n + 1);
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return cache;
}
