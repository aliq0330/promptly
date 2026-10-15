"use client";

import { useCallback, useEffect, useRef } from "react";
import { shareToCommunity, type CommunityPostType } from "@/lib/supabase/communities";
import { toGroupError } from "@/lib/supabase/chat-groups";
import { communityHref } from "@/lib/communities";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Topluluk bağlamında içerik oluşturma (`/create?community=<id>` vb.): oluşturma formlarının kullandığı küçük köprü.
 * Parametre ilk açılışta okunur (kaydederken adres `?edit=` ile değişse bile kaybolmaz). Yeni içerik YAYINLANINCA ve herkese açıksa
 * toplulukta paylaşılır; özel/taslak içerik topluluk yoluyla herkese açılmaz — paylaşım reddedilir, içerik olduğu gibi kalır ve
 * kullanıcı akışta nedenini görür. Her durumda dönüş adresi topluluğun akışıdır; `null` = topluluk bağlamı yok (form eski davranışını sürdürür).
 */
export function useCommunityReturn(): (type: CommunityPostType, contentId: string) => Promise<string | null> {
  const communityRef = useRef<string | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("community");
    communityRef.current = value && UUID.test(value) ? value : null;
  }, []);

  return useCallback(async (type, contentId) => {
    const communityId = communityRef.current;
    if (!communityId) return null;
    try {
      await shareToCommunity(communityId, type, contentId, "");
      return `${communityHref(communityId, "feed")}&shared=1`;
    } catch (err) {
      console.error("shareNewContentToCommunity", err);
      const code = toGroupError(err instanceof Error ? err : null).code ?? "generic";
      return `${communityHref(communityId, "feed")}&shareFailed=${encodeURIComponent(code)}`;
    }
  }, []);
}
