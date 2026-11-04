"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { UNKNOWN_PRESENCE, type PresenceView } from "@/lib/presence";
import { getPresenceView, presenceSubscribe, presenceVersion, watchPresence } from "./presence-store";

/**
 * Bir kişinin çevrimiçi durumu ve son görülmesi (docs/history/329-*). Bileşen çizildiği sürece kişi izlenir; aynı kişiyi gösteren bütün bileşenler
 * aynı kaydı ve en çok BİR canlı kanalı paylaşır. Görmeye yetkin yoksa (gizlilik, engel, görünmez, oturumsuz) `visible: false` döner.
 */
export function usePresence(userId: string | null | undefined): PresenceView {
  useEffect(() => (userId ? watchPresence([userId]) : undefined), [userId]);
  return useSyncExternalStore(
    presenceSubscribe,
    () => getPresenceView(userId),
    () => UNKNOWN_PRESENCE,
  );
}

const EMPTY: ReadonlySet<string> = new Set();
const onlineCache = new Map<string, { version: number; set: ReadonlySet<string> }>();

function onlineSetFor(key: string, ids: readonly string[]): ReadonlySet<string> {
  const v = presenceVersion();
  const cached = onlineCache.get(key);
  if (cached && cached.version === v) return cached.set;
  const next = new Set(ids.filter((id) => getPresenceView(id).online));
  const same = cached && cached.set.size === next.size && [...next].every((id) => cached.set.has(id));
  const set = same ? cached.set : next.size === 0 ? EMPTY : next;
  onlineCache.set(key, { version: v, set });
  if (onlineCache.size > 50) onlineCache.delete(onlineCache.keys().next().value as string);
  return set;
}

/** Verilen kişilerden şu an çevrimiçi olanlar — listeleri "çevrimiçiler önce" sıralamak için (`sortOnlineFirst`). */
export function useOnlineIds(ids: readonly (string | null | undefined)[]): ReadonlySet<string> {
  const clean = useMemo(() => [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))].sort(), [ids]);
  const key = clean.join(",");
  useEffect(() => (clean.length ? watchPresence(clean) : undefined), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(
    presenceSubscribe,
    () => (clean.length ? onlineSetFor(key, clean) : EMPTY),
    () => EMPTY,
  );
}
