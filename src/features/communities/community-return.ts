"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fetchCommunityCard, type CommunityPostType } from "@/lib/supabase/communities";
import { communityHref } from "@/lib/communities";
import type { GroupVisibility } from "@/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function communityIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("community");
  return value && UUID.test(value) ? value : null;
}

/** Oluşturma ekranının "Nerede paylaşmak istiyorsun?" seçicisinde seçilen topluluk (adı ve logosu seçici satırında gösterilir). */
export interface CreateDestination {
  id: string;
  name: string;
  avatarUrl: string | null;
  visibility: GroupVisibility;
}

// `undefined` = seçici dokunulmadı → adres parametresi (`?community=`) geçerli; `null` = bilerek "Genel akış"; değer = seçilen topluluk.
// Formlar `useCommunityContext`'i ayrı ayrı çağırdığı için seçim paylaşılan bir depodadır; alan yeniden kurulursa yazılan içerik kaybolmaz.
let picked: CreateDestination | null | undefined;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function setPicked(next: CreateDestination | null | undefined) {
  picked = next;
  listeners.forEach((listener) => listener());
}

/** Seçicide hedef seçildi: bir topluluk ya da `null` = Genel akış. Formlar bu değeri `useCommunityContext`/`useCommunityReturn` ile okur. */
export function pickCreateDestination(next: CreateDestination | null) {
  setPicked(next);
}

/** Oluşturma ekranından çıkılınca seçim atılır (sonraki ekran adres parametresinden başlar). */
export function resetCreateDestination() {
  setPicked(undefined);
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
    const communityId = picked !== undefined ? (picked?.id ?? null) : communityRef.current;
    return communityId ? `${communityHref(communityId, "feed")}&shared=1` : null;
  }, []);
}

/**
 * Oluşturma ekranının hangi toplulukta açıldığı (`?community=`) ya da seçicide seçildiği: sonunda "Görünürlük" kartı bunu gösterir ki
 * kullanıcı içeriğin toplulukta yayınlanacağını bilsin. Seçici dokunulmadıysa ad/logo topluluk kartından (üye olmayan da okuyabilir)
 * alınır; kart gelene kadar `name` null'dır.
 */
export function useCommunityContext(): { communityId: string | null; name: string | null; avatarUrl: string | null; visibility: GroupVisibility | null } {
  const [urlCommunityId, setUrlCommunityId] = useState<string | null>(null);
  const [card, setCard] = useState<{ id: string; name: string; avatarUrl: string | null; visibility: GroupVisibility } | null>(null);
  const override = useSyncExternalStore(
    subscribe,
    () => picked,
    () => undefined,
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adres parametresi yalnızca tarayıcıda okunur
    setUrlCommunityId(communityIdFromUrl());
  }, []);
  const communityId = override !== undefined ? (override?.id ?? null) : urlCommunityId;
  const needsCard = communityId !== null && override === undefined;
  useEffect(() => {
    if (!needsCard || !communityId) return;
    let cancelled = false;
    fetchCommunityCard(communityId)
      .then((result) => {
        if (!cancelled && result) setCard({ id: result.id, name: result.name, avatarUrl: result.avatarUrl, visibility: result.visibility });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needsCard, communityId]);
  if (override) return { communityId: override.id, name: override.name, avatarUrl: override.avatarUrl, visibility: override.visibility };
  const fetched = card && card.id === communityId ? card : null;
  return { communityId, name: fetched?.name ?? null, avatarUrl: fetched?.avatarUrl ?? null, visibility: fetched?.visibility ?? null };
}
