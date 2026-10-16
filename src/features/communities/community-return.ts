"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCommunityCard, type CommunityPostType } from "@/lib/supabase/communities";
import { communityHref } from "@/lib/communities";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function communityIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("community");
  return value && UUID.test(value) ? value : null;
}

/**
 * Topluluk bağlamında içerik oluşturma (`/create?mode=prompt&community=<id>` vb.): oluşturma formlarının kullandığı küçük köprü.
 * İçerik zaten topluluğa ait oluşturulur (`community_id` kolonu — sunucu gönderiyi kendiliğinden ekler, görünürlüğü topluluğa
 * zorlar); burada yalnızca yayından sonra nereye dönüleceği söylenir: topluluğun akışı. `null` = topluluk bağlamı yok
 * (form eski davranışını sürdürür). Parametre ilk açılışta okunur (kaydederken adres `?edit=` ile değişse bile kaybolmaz).
 */
export function useCommunityReturn(): (type: CommunityPostType, contentId: string) => Promise<string | null> {
  const communityRef = useRef<string | null>(null);
  useEffect(() => {
    communityRef.current = communityIdFromUrl();
  }, []);

  return useCallback(async () => {
    const communityId = communityRef.current;
    return communityId ? `${communityHref(communityId, "feed")}&shared=1` : null;
  }, []);
}

/**
 * Oluşturma ekranının hangi toplulukta açıldığı (`?community=`): sonunda "Görünürlük" kartı bunu gösterir ki kullanıcı içeriğin
 * toplulukta yayınlanacağını bilsin. Ad, topluluk kartından (üye olmayan da okuyabilir) alınır; kart gelene kadar `name` null'dır.
 */
export function useCommunityContext(): { communityId: string | null; name: string | null } {
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adres parametresi yalnızca tarayıcıda okunur
    setCommunityId(communityIdFromUrl());
  }, []);
  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;
    fetchCommunityCard(communityId)
      .then((card) => {
        if (!cancelled) setName(card?.name ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [communityId]);
  return { communityId, name };
}
