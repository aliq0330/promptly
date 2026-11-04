"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  fetchCommunityOnlineMembers,
  fetchCommunityPresenceCounts,
  fetchEventsPresence,
  fetchLinkPresenceCount,
  type EventPresence,
  type OnlineMember,
} from "@/lib/supabase/presence";
import { isPresenceUnavailable, presenceSubscribe } from "./presence-store";
import { useMyPresence } from "./presence-provider";

/**
 * Topluluk ve etkinlik çevrimiçi bilgileri (docs/history/329-*). Sayılar SUNUCUDA, son görülme penceresinden toplu hesaplanır (100 000 üyeli
 * toplulukta Presence kanalı açılmaz); kimlikli listeler kişi başına gizliliğe tabidir. Topluluk sayıları 60 sn önbelleklidir ve aynı anda çizilen
 * kartların istekleri TEK çağrıda toplanır. Kendi durumunu gizleyen izleyici (karşılıklılık) hiçbir şey almaz — sunucu zaten boş döndürür,
 * istemci de hiç sormaz.
 */

const COUNT_TTL_MS = 60_000;
const counts = new Map<string, { count: number | null; at: number }>();
const countListeners = new Set<() => void>();
let countQueue = new Set<string>();
let countTimer: ReturnType<typeof setTimeout> | null = null;

function emitCounts() {
  for (const fn of countListeners) fn();
}

function queueCounts(ids: string[]) {
  const now = Date.now();
  for (const id of ids) {
    const c = counts.get(id);
    if (!c || now - c.at >= COUNT_TTL_MS) countQueue.add(id);
  }
  if (countQueue.size === 0 || countTimer) return;
  countTimer = setTimeout(async () => {
    countTimer = null;
    const batch = [...countQueue];
    countQueue = new Set();
    for (let i = 0; i < batch.length; i += 50) {
      const part = batch.slice(i, i + 50);
      try {
        const result = await fetchCommunityPresenceCounts(part);
        const at = Date.now();
        // Dönmeyen topluluk = okuyamıyorum (kapalı ve üye değilim): sayı yok.
        for (const id of part) counts.set(id, { count: result.get(id) ?? null, at });
      } catch {
        for (const id of part) counts.set(id, { count: null, at: Date.now() });
      }
    }
    emitCounts();
  }, 40);
}

function usePresenceEnabled(): boolean {
  const { user } = useAuth();
  const { me } = useMyPresence();
  // Boole anlık görüntü: yalnız "özellik sunucuda yok" kararı değişince yeniden çizer (her durum olayında değil).
  const unavailable = useSyncExternalStore(presenceSubscribe, isPresenceUnavailable, () => false);
  const hidden = me ? me.mode === "invisible" || me.audience === "nobody" : true;
  return Boolean(user) && !hidden && !unavailable;
}

/** Toplulukların "şu an aktif" sayıları (kart, raf, davet sayfası, sohbet başlığı). Bilinmeyen/okunamayan → yok. */
export function useCommunityPresenceCounts(ids: readonly string[]): ReadonlyMap<string, number> {
  const on = usePresenceEnabled();
  const key = [...new Set(ids)].sort().join(",");
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    countListeners.add(fn);
    return () => {
      countListeners.delete(fn);
    };
  }, []);
  useEffect(() => {
    if (!on || !key) return;
    const list = key.split(",");
    queueCounts(list);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") queueCounts(list);
    }, COUNT_TTL_MS);
    return () => clearInterval(timer);
  }, [on, key]);
  const out = new Map<string, number>();
  if (!on) return out;
  for (const id of ids) {
    const c = counts.get(id)?.count;
    if (typeof c === "number") out.set(id, c);
  }
  return out;
}

export function useCommunityPresenceCount(id: string | null | undefined): number | null {
  const map = useCommunityPresenceCounts(id ? [id] : []);
  return id ? (map.get(id) ?? null) : null;
}

/** Toplulukta şu an çevrimiçi üyeler (kişi başına gizlilik sunucuda). `staffOnly` = sahip/yönetici/moderatör. */
export function useCommunityOnlineMembers(groupId: string | null | undefined, opts: { staffOnly?: boolean; limit?: number; enabled?: boolean } = {}) {
  const on = usePresenceEnabled() && opts.enabled !== false;
  const staffOnly = opts.staffOnly ?? false;
  const limit = opts.limit ?? 50;
  const [state, setState] = useState<{ key: string; members: OnlineMember[]; error: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const key = `${groupId}|${staffOnly}|${limit}|${reload}`;
  useEffect(() => {
    if (!on || !groupId) return;
    let cancelled = false;
    fetchCommunityOnlineMembers(groupId, { staffOnly, limit })
      .then((members) => {
        if (!cancelled) setState({ key, members, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, members: [], error: true });
      });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setReload((n) => n + 1);
    }, 120_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [on, groupId, staffOnly, limit, key]);
  const current = state && state.key === key ? state : null;
  return {
    enabled: on,
    loading: on && Boolean(groupId) && !current,
    error: current?.error ?? false,
    members: on ? (current?.members ?? []) : [],
    reload: () => setReload((n) => n + 1),
  };
}

/** Etkinlik başına aktif katılımcı sayısı + (üyeye) görebildiği çevrimiçi katılımcılar. */
export function useEventsPresence(eventIds: readonly string[]): ReadonlyMap<string, EventPresence> {
  const on = usePresenceEnabled();
  const key = [...new Set(eventIds)].sort().join(",");
  const [state, setState] = useState<{ key: string; map: Map<string, EventPresence> } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!on || !key) return;
    let cancelled = false;
    fetchEventsPresence(key.split(","))
      .then((map) => {
        if (!cancelled) setState({ key, map });
      })
      .catch(() => {
        if (!cancelled) setState({ key, map: new Map() });
      });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, 120_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [on, key, tick]);
  return on && state && state.key === key ? state.map : new Map();
}

/** Davet bağlantısı sayfası: jetonla sayı (yalnız geçerli bağlantı + herkese açık topluluk; aksi hâlde null). */
export function useLinkPresenceCount(token: string | null | undefined): number | null {
  const on = usePresenceEnabled();
  const [state, setState] = useState<{ token: string; count: number | null } | null>(null);
  useEffect(() => {
    if (!on || !token) return;
    let cancelled = false;
    fetchLinkPresenceCount(token)
      .then((count) => {
        if (!cancelled) setState({ token, count });
      })
      .catch(() => {
        if (!cancelled) setState({ token, count: null });
      });
    return () => {
      cancelled = true;
    };
  }, [on, token]);
  return on && token && state?.token === token ? state.count : null;
}
