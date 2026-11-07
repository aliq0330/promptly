"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchCommunityRooms } from "@/lib/supabase/community-rooms";
import type { CommunityRoom } from "@/types";

/**
 * Bir topluluğun sohbet odaları (docs/history/352-*): oda listesi + kişisel durum + oda başına okunmamış sayısı TEK sunucu çağrısıdır
 * (`community_rooms_overview`). Aynı topluluğu soran birden çok yüzey (oda çipi, değiştirici, merkez, yönetim, sol ağaç) modül önbelleğini
 * paylaşır; önbellek eski veriyi hemen gösterir (SWR), yeni mesaj/oda değişikliği gelince arka planda yenilenir.
 */

const cache = new Map<string, CommunityRoom[]>();
const inflight = new Map<string, Promise<CommunityRoom[]>>();
const listeners = new Map<string, Set<(rooms: CommunityRoom[]) => void>>();

function publish(communityId: string, rooms: CommunityRoom[]) {
  cache.set(communityId, rooms);
  listeners.get(communityId)?.forEach((fn) => fn(rooms));
}

/** Dışarıdan (ör. oda oluşturunca/okuyunca) listeyi sunucudan tazeler; eşzamanlı çağrılar tek istekte birleşir. */
export function refreshCommunityRooms(communityId: string): Promise<CommunityRoom[]> {
  const pending = inflight.get(communityId);
  if (pending) return pending;
  const request = fetchCommunityRooms(communityId)
    .then((rooms) => {
      publish(communityId, rooms);
      return rooms;
    })
    .finally(() => inflight.delete(communityId));
  inflight.set(communityId, request);
  return request;
}

/** Yerel (iyimser) güncelleme: sunucu çağrısı beklemeden bir odanın alanlarını değiştirir (ör. okundu → sayı 0). */
export function patchCachedRoom(communityId: string, roomId: string, patch: Partial<CommunityRoom>) {
  const rooms = cache.get(communityId);
  if (!rooms) return;
  publish(communityId, rooms.map((room) => (room.id === roomId ? { ...room, ...patch } : room)));
}

export function getCachedRooms(communityId: string): CommunityRoom[] | undefined {
  return cache.get(communityId);
}

// Canlı dinleme topluluk başına TEK kanaldır (oda çipi, değiştirici, merkez ve ağaç aynı anda açık olabilir): sayaçla paylaşılır,
// son kullanan ayrılınca kanal kapanır. Olaylar kısa bir gecikmeyle birleşir ve tek yenilemeye döner.
const liveChannels = new Map<string, { count: number; stop: () => void }>();

function retainLiveChannel(communityId: string): () => void {
  const existing = liveChannels.get(communityId);
  if (existing) {
    existing.count += 1;
  } else {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void refreshCommunityRooms(communityId).catch((err) => console.error("community rooms", err));
      }, 400);
    };
    const channel = supabase
      .channel(`rooms:${communityId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${communityId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_rooms", filter: `community_id=eq.${communityId}` }, schedule)
      .subscribe();
    liveChannels.set(communityId, {
      count: 1,
      stop: () => {
        if (timer) clearTimeout(timer);
        void supabase.removeChannel(channel);
      },
    });
  }
  return () => {
    const entry = liveChannels.get(communityId);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) {
      entry.stop();
      liveChannels.delete(communityId);
    }
  };
}

export interface UseCommunityRooms {
  rooms: CommunityRoom[];
  /** İlk yükleme sürüyor ve önbellekte veri yok. */
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
}

const NO_ROOMS: CommunityRoom[] = [];

/**
 * `live`: bu topluluğun mesajlarını ve oda değişikliklerini dinleyip listeyi (sayıları) tazeler. Çok sayıda satır çizen yüzeyler
 * (masaüstü ağaç) yalnız genişletilen topluluk için açar.
 */
export function useCommunityRooms(communityId: string | null | undefined, options: { enabled?: boolean; live?: boolean } = {}): UseCommunityRooms {
  const { enabled = true, live = true } = options;
  const { user } = useAuth();
  // Veri modül önbelleğindedir; değişince bu sayaç yüzeyi yeniden çizdirir (durumu efektte kopyalamak yerine okuma anında türetilir).
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [failed, setFailed] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!communityId) return;
    try {
      await refreshCommunityRooms(communityId);
      if (aliveRef.current) setFailed(null);
    } catch (err) {
      console.error("community rooms", err);
      if (aliveRef.current) setFailed(communityId);
    }
  }, [communityId]);

  useEffect(() => {
    if (!communityId || !enabled || !user) return;
    const set = listeners.get(communityId) ?? new Set();
    const listener = () => bump();
    set.add(listener);
    listeners.set(communityId, set);
    refreshCommunityRooms(communityId)
      .then(() => aliveRef.current && setFailed(null))
      .catch((err) => {
        console.error("community rooms", err);
        if (aliveRef.current) setFailed(communityId);
      });
    return () => {
      set.delete(listener);
    };
  }, [communityId, enabled, user]);

  // Canlı: yeni mesaj (okunmamış sayıları) ve oda ekleme/düzenleme/silme.
  useEffect(() => {
    if (!communityId || !enabled || !live || !user) return;
    return retainLiveChannel(communityId);
  }, [communityId, enabled, live, user]);

  const rooms = (communityId ? cache.get(communityId) : undefined) ?? NO_ROOMS;
  const error = Boolean(communityId) && failed === communityId;
  return { rooms, loading: Boolean(communityId) && enabled && !cache.has(communityId ?? "") && !error, error, reload };
}
