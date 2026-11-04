"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchNotificationMutes, setNotificationMute } from "@/lib/supabase/notifications";
import { notificationHrefBase } from "@/lib/notification-mirror";

/**
 * Sessize alınan kişi/içeriklerin oturum boyu paylaşılan durumu (docs/history/327-*): bildirim ayrıntısı, kart menüsü ve profil "⋮" menüsü aynı
 * bilgiyi okur ki sessize alınmış bir kişi için düğme "Sessize al" değil "Sesini aç" desin. Kaynak `notification_mutes` (kullanıcı başına ≤200, kendi
 * satırlarını okur); ilk ihtiyaçta bir kez okunur, sonra iyimser güncellenir. Modül tekili: statik export'ta modül yalnız bir ziyaretçinin sekmesinde yaşar
 * ve kimlik değişince sayfa baştan yüklenir (CLAUDE.md §8.10).
 */

export type MuteKind = "actor" | "content";

/** Sunucudaki normalleştirme ile aynı anahtar: kişi küçük harf, içerik `hl=`'siz taban adres (`set_notification_mute`). */
export function muteKey(kind: MuteKind, target: string): string {
  return `${kind}:${kind === "actor" ? target.toLowerCase() : notificationHrefBase(target)}`;
}

let keys = new Set<string>();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  keys = new Set(keys);
  for (const fn of listeners) fn();
}

async function load(): Promise<void> {
  if (loaded) return;
  if (!loading) {
    loading = fetchNotificationMutes()
      .then((rows) => {
        // Yükleme sürerken iyimser yazılanlar kaybolmasın: sunucu listesiyle birleştirilir.
        for (const row of rows) keys.add(muteKey(row.kind, row.target));
        loaded = true;
        emit();
      })
      .catch((err) => console.error("notification mutes", err))
      .finally(() => {
        loading = null;
      });
  }
  await loading;
}

/** Yerel durumu (sunucuya yazmadan) günceller: Ayarlar'daki "Sesini aç" gibi başka yerden yapılan değişiklikler için. */
export function setMutedLocally(kind: MuteKind, target: string, muted: boolean) {
  const key = muteKey(kind, target);
  if (muted === keys.has(key)) return;
  if (muted) keys.add(key);
  else keys.delete(key);
  emit();
}

/** Sunucuya yazar, başarısızsa yerel durumu geri alır ve fırlatır. */
export async function applyMute(kind: MuteKind, target: string, label: string, muted: boolean): Promise<void> {
  const before = keys.has(muteKey(kind, target));
  setMutedLocally(kind, target, muted);
  try {
    await setNotificationMute(kind, target, label, muted);
  } catch (err) {
    setMutedLocally(kind, target, before);
    throw err;
  }
}

/** Bu kişi/içerik sessize alınmış mı. Oturumlu kullanıcıda ilk kullanımda listeyi bir kez okur; okunana kadar `loaded` false. */
export function useIsMuted(kind: MuteKind, target: string | null | undefined): { muted: boolean; loaded: boolean } {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => keys,
    () => keys,
  );
  useEffect(() => {
    if (user && target && !loaded) void load();
  }, [user, target]);
  const key = target ? muteKey(kind, target) : null;
  return { muted: key ? snapshot.has(key) : false, loaded };
}

/** `useIsMuted` + aç/kapa: profil menüsü gibi şeritsiz yerlerde kullanılır. */
export function useMuteToggle(kind: MuteKind, target: string | null | undefined, label: string) {
  const state = useIsMuted(kind, target);
  const toggle = useCallback(async (): Promise<boolean> => {
    if (!target) return state.muted;
    const next = !state.muted;
    await applyMute(kind, target, label, next);
    return next;
  }, [kind, target, label, state.muted]);
  return { ...state, toggle };
}
