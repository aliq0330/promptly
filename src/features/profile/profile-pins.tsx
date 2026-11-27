"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchProfilePins, pinKey, setProfilePin, type PinKind, type ProfilePin } from "@/lib/supabase/profile-pins";

/**
 * "Profilde sabitle" durumu (docs/history/480-*). İki okuyucu aynı bilgiyi kullanır: içeriğin ⋮ menüsü ("Profilde sabitle" ↔ "Sabitlemeyi kaldır") ve
 * profil sayfası (sabitler bölümün en üstüne, raptiye işaretiyle). Oturumdaki kişinin KENDİ sabitleri modül tekilidir — ilk ihtiyaçta bir kez okunur,
 * sonra iyimser güncellenir (statik export'ta modül bir ziyaretçinin sekmesinde yaşar; kimlik değişince sayfa baştan yüklenir, CLAUDE.md §8.10).
 * Başkasının profilindeki sabitler salt okunurdur ve yalnız o profil açıkken okunur.
 */

let ownPins: ProfilePin[] = [];
let ownLoaded = false;
let ownLoading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  ownPins = [...ownPins];
  for (const fn of listeners) fn();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

async function loadOwn(userId: string): Promise<void> {
  if (ownLoaded) return;
  if (!ownLoading) {
    ownLoading = fetchProfilePins(userId)
      .then((rows) => {
        // Yükleme sürerken iyimser eklenenler kaybolmasın: sunucu listesiyle birleştirilir.
        const known = new Set(ownPins.map((pin) => pinKey(pin.kind, pin.id)));
        ownPins = [...ownPins, ...rows.filter((row) => !known.has(pinKey(row.kind, row.id)))];
        ownLoaded = true;
        emit();
      })
      .catch((err) => console.error("profile pins", err))
      .finally(() => {
        ownLoading = null;
      });
  }
  await ownLoading;
}

/** Sunucuya yazar; başarısızsa yerel durumu geri alır ve fırlatır. Sonuç: işlemden sonra sabit mi. */
export async function applyProfilePin(kind: PinKind, id: string, pinned: boolean): Promise<boolean> {
  const before = ownPins;
  const key = pinKey(kind, id);
  ownPins = pinned ? [{ kind, id, createdAt: new Date().toISOString() }, ...before.filter((pin) => pinKey(pin.kind, pin.id) !== key)] : before.filter((pin) => pinKey(pin.kind, pin.id) !== key);
  emit();
  try {
    return await setProfilePin(kind, id, pinned);
  } catch (err) {
    ownPins = before;
    emit();
    throw err;
  }
}

/** Oturumdaki kişinin sabitleri; `enabled` false iken (ör. menü kapalı) hiçbir şey okunmaz. */
export function useOwnProfilePins(enabled = true): { pins: ProfilePin[]; loaded: boolean } {
  const { user } = useAuth();
  const pins = useSyncExternalStore(
    subscribe,
    () => ownPins,
    () => ownPins,
  );
  const userId = user?.id ?? null;
  useEffect(() => {
    if (enabled && userId && !ownLoaded) void loadOwn(userId);
  }, [enabled, userId]);
  return { pins, loaded: ownLoaded };
}

/** Bir içeriğin "Profilde sabitle" durumu + aç/kapa (⋮ menüsü). */
export function usePinToggle(kind: PinKind, id: string, enabled: boolean) {
  const { pins, loaded } = useOwnProfilePins(enabled);
  const pinned = pins.some((pin) => pin.kind === kind && pin.id === id);
  const toggle = useCallback(() => applyProfilePin(kind, id, !pinned), [kind, id, pinned]);
  return { pinned, loaded, toggle };
}

/** Bir profilin sabitleri: kendi profilimse paylaşılan depodan (menüyle eşzamanlı), başkasınınsa bir kez okunur. */
export function useProfilePins(profileUserId: string): { pins: ProfilePin[]; loaded: boolean } {
  const { user } = useAuth();
  const mine = user?.id === profileUserId;
  const own = useOwnProfilePins(mine);
  const [other, setOther] = useState<{ userId: string; pins: ProfilePin[] } | null>(null);
  useEffect(() => {
    if (mine) return;
    let cancelled = false;
    fetchProfilePins(profileUserId)
      .then((rows) => !cancelled && setOther({ userId: profileUserId, pins: rows }))
      .catch((err) => {
        console.error("profile pins", err);
        if (!cancelled) setOther({ userId: profileUserId, pins: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [mine, profileUserId]);
  if (mine) return own;
  const ready = other?.userId === profileUserId;
  return { pins: ready ? other.pins : [], loaded: ready };
}

/** Profil sayfasındaki kartlar ve bölümler bu bağlamı okur: raptiye işareti ve "sabitler en üstte" yalnız burada (akışta/aramada yok). */
interface PinScopeValue {
  keys: ReadonlySet<string>;
  pins: ProfilePin[];
}
const PinnedScopeContext = createContext<PinScopeValue | null>(null);

export function ProfilePinScope({ pins, children }: { pins: ProfilePin[]; children: ReactNode }) {
  const value = useMemo(() => ({ keys: new Set(pins.map((pin) => pinKey(pin.kind, pin.id))), pins }), [pins]);
  return <PinnedScopeContext.Provider value={value}>{children}</PinnedScopeContext.Provider>;
}

/** Bu kart, açık profilin sabitlerinden biri mi (profil dışında her zaman false). */
export function usePinnedHere(kind: PinKind, id: string): boolean {
  const scope = useContext(PinnedScopeContext);
  return scope ? scope.keys.has(pinKey(kind, id)) : false;
}

/**
 * Açık profilin bir türdeki sabit gönderileri (en son sabitlenen başta): kimlikleriyle okunur, `isShown` süzgecinden (yayında + herkese açık) geçenler döner.
 * Bölümün kendi sayfalı listesi bunların ARKASINA eklenir (`mergePinned`); okuyamadığın içerik (gizlenmiş, engelli yazar) zaten dönmez.
 */
export function usePinnedItems<T extends { id: string }>(kind: PinKind, fetchByIds: (ids: string[]) => Promise<T[]>, isShown: (item: T) => boolean, enabled = true): T[] {
  const scope = useContext(PinnedScopeContext);
  return usePinnedItemsFor(scope?.pins ?? NO_PROFILE_PINS, kind, fetchByIds, isShown, enabled);
}

export const NO_PROFILE_PINS: ProfilePin[] = [];

/** `usePinnedItems`'ın açık sabit listesi alan hâli: bağlamı kuran bileşenin KENDİSİ (profil sayfası) kendi bağlamını okuyamaz. */
export function usePinnedItemsFor<T extends { id: string }>(pins: ProfilePin[], kind: PinKind, fetchByIds: (ids: string[]) => Promise<T[]>, isShown: (item: T) => boolean, enabled = true): T[] {
  const ids = useMemo(() => pins.filter((pin) => pin.kind === kind).map((pin) => pin.id), [pins, kind]);
  const key = ids.join(",");
  const [loaded, setLoaded] = useState<{ key: string; items: T[] } | null>(null);
  useEffect(() => {
    if (!enabled || ids.length === 0) return;
    let cancelled = false;
    fetchByIds(ids)
      .then((rows) => {
        if (cancelled) return;
        const byId = new Map(rows.map((row) => [row.id, row]));
        setLoaded({ key, items: ids.map((id) => byId.get(id)).filter((row): row is T => Boolean(row) && isShown(row as T)) });
      })
      .catch((err) => console.error("pinned items", err));
    return () => {
      cancelled = true;
    };
    // `fetchByIds` / `isShown` modül düzeyi işlevlerdir; kimlik listesi değişince yeniden okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  if (!enabled || ids.length === 0) return EMPTY as T[];
  return loaded && loaded.key === key ? loaded.items : (EMPTY as T[]);
}

const EMPTY: never[] = [];

/** Sabitler en üstte, sayfalı listenin geri kalanı arkasında (aynı gönderi iki kez çıkmaz). */
export function mergePinned<T extends { id: string }>(pinned: readonly T[], items: readonly T[]): T[] {
  if (pinned.length === 0) return items as T[];
  const taken = new Set(pinned.map((item) => item.id));
  return [...pinned, ...items.filter((item) => !taken.has(item.id))];
}
