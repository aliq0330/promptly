"use client";

import { useCallback, useEffect, useState } from "react";
import { listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";

const MAX_PAGES = 5;

/**
 * Yönettiğim topluluklar (sahip/yönetici/moderatör; `list_my_communities` 'managed'). "Yönettiklerim" sekmesinin görünürlüğü ve
 * "Gelen başvurular" sayaçları buradan gelir. `ready` olmadan sekme çizilmez (yanıp sönme yok); hata → yönetilen yok sayılır.
 */
export function useManagedCommunities(userId: string | null) {
  const [state, setState] = useState<{ userId: string | null; items: CommunitySummary[] } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const all: CommunitySummary[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await listMyCommunities("managed", all.length);
        all.push(...result.communities);
        if (!result.hasMore) break;
      }
      return all;
    })()
      .then((items) => !cancelled && setState({ userId, items }))
      .catch((err) => {
        console.error("managed communities", err);
        if (!cancelled) setState({ userId, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const ready = Boolean(userId) && state?.userId === userId;
  return { ready, managed: ready && state ? state.items : [], reload };
}
