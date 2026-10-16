"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCommunityCard, publishNativeCommunityPost, type CommunityPostType } from "@/lib/supabase/communities";
import { GroupActionError, toGroupError } from "@/lib/supabase/chat-groups";
import { communityHref } from "@/lib/communities";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function communityIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("community");
  return value && UUID.test(value) ? value : null;
}

/**
 * Topluluk bağlamında içerik oluşturma (`/create?community=<id>` vb.): oluşturma formlarının kullandığı küçük köprü.
 * Parametre ilk açılışta okunur (kaydederken adres `?edit=` ile değişse bile kaybolmaz). Yeni içerik YAYINLANINCA bu toplulukta
 * kendi kimliğiyle bir YEREL gönderi olarak kaydedilir (`publish_native_community_post`): içerik normal görünürlüğünü korur —
 * herkese açıksa herkese, özelse yalnızca bu topluluğu okuyabilenlere görünür. Hata olursa içerik olduğu gibi kalır ve kullanıcı
 * akışta nedenini görür. Her durumda dönüş adresi topluluğun akışıdır; `null` = topluluk bağlamı yok (form eski davranışını sürdürür).
 */
export function useCommunityReturn(): (type: CommunityPostType, contentId: string) => Promise<string | null> {
  const communityRef = useRef<string | null>(null);
  useEffect(() => {
    communityRef.current = communityIdFromUrl();
  }, []);

  return useCallback(async (type, contentId) => {
    const communityId = communityRef.current;
    if (!communityId) return null;
    try {
      await publishNativeCommunityPost(communityId, type, contentId);
      return `${communityHref(communityId, "feed")}&shared=1`;
    } catch (err) {
      console.error("publishNativeCommunityPost", err);
      // `callRpc` zaten çevrilmiş bir GroupActionError atar (kodu taşır); başka hata türünde kod çıkarılamaz → "generic".
      const code = (err instanceof GroupActionError ? err : toGroupError(err instanceof Error ? err : null)).code ?? "generic";
      return `${communityHref(communityId, "feed")}&shareFailed=${encodeURIComponent(code)}`;
    }
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
