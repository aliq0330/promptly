"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_LIVE_NOTIFY_PREFS,
  LIVE_NOTIFY_PREFS_KEY,
  parseLiveNotifyPrefs,
  serializeLiveNotifyPrefs,
  type LiveNotifyPrefs,
} from "@/lib/live-notification-prefs";
import { LIVE_TOAST_PREF_KEY, parseLiveToastPref } from "@/lib/live-notification-toast";

/**
 * Canlı bildirim tercihleri (docs/history/434-*, 435-*): Ayarlar → Bildirimler. İkisi de cihaz başınadır (`localStorage`) ve yazılmamışsa varsayılan geçerlidir:
 *  - ana anahtar `promptly-live-toasts` (kart açık/kapalı; yoksa AÇIK),
 *  - ince ayar `promptly-live-toast-prefs` (hangi tür kart çıksın, ses, sekme sayacı).
 * Depolama yazılamazsa (özel pencere, kota) oturum boyu bellekte tutulur. Bildirimin kendisi etkilenmez: kapalıyken de gelen kutusuna düşer, zil rozeti artar,
 * Telegram'a gider — yalnız sitedeyken çıkan kart/ses/sekme sayacı yoktur. Sessiz saatler hesap başınadır ve ayrıdır (`quiet-hours-store.ts`).
 */
const CHANGE_EVENT = "promptly:live-toasts";

let memoryMaster: boolean | null = null;
let memoryPrefs: LiveNotifyPrefs | null = null;
let prefsRaw: string | null | undefined;
let prefsParsed: LiveNotifyPrefs = DEFAULT_LIVE_NOTIFY_PREFS;

function readMaster(): boolean {
  if (memoryMaster !== null) return memoryMaster;
  try {
    return parseLiveToastPref(window.localStorage.getItem(LIVE_TOAST_PREF_KEY));
  } catch {
    return true;
  }
}

/** Aynı ham metin için AYNI nesneyi döndürür (`useSyncExternalStore` anlık görüntüsü kararlı olmalı). */
function readPrefs(): LiveNotifyPrefs {
  if (memoryPrefs) return memoryPrefs;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LIVE_NOTIFY_PREFS_KEY);
  } catch {
    return DEFAULT_LIVE_NOTIFY_PREFS;
  }
  if (raw !== prefsRaw) {
    prefsRaw = raw;
    prefsParsed = parseLiveNotifyPrefs(raw);
  }
  return prefsParsed;
}

export function setLiveToastsEnabled(on: boolean): void {
  memoryMaster = on;
  try {
    if (on) window.localStorage.removeItem(LIVE_TOAST_PREF_KEY);
    else window.localStorage.setItem(LIVE_TOAST_PREF_KEY, "off");
  } catch {
    // Yazılamadı: tercih bu sekmede bellekte kalır.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** İnce ayarın bir kısmını günceller (tür anahtarı, ses, sekme sayacı). */
export function updateLiveNotifyPrefs(patch: { types?: Partial<LiveNotifyPrefs["types"]>; sound?: boolean; tabBadge?: boolean }): void {
  const current = readPrefs();
  const next: LiveNotifyPrefs = {
    types: { ...current.types, ...patch.types },
    sound: patch.sound ?? current.sound,
    tabBadge: patch.tabBadge ?? current.tabBadge,
  };
  memoryPrefs = next;
  try {
    window.localStorage.setItem(LIVE_NOTIFY_PREFS_KEY, serializeLiveNotifyPrefs(next));
  } catch {
    // Yazılamadı: tercih bu sekmede bellekte kalır.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Bileşen dışından (Realtime dinleyicisi) güncel ince ayar. */
export function getLiveNotifyPrefs(): LiveNotifyPrefs {
  return readPrefs();
}

function subscribe(notify: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LIVE_TOAST_PREF_KEY || event.key === LIVE_NOTIFY_PREFS_KEY || event.key === null) {
      if (event.key !== LIVE_NOTIFY_PREFS_KEY) memoryMaster = null;
      if (event.key !== LIVE_TOAST_PREF_KEY) memoryPrefs = null;
      notify();
    }
  };
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** Canlı bildirim kartı açık mı (sunucu/ilk boyamada `true`). */
export function useLiveToastsEnabled(): boolean {
  return useSyncExternalStore(subscribe, readMaster, () => true);
}

/** İnce ayar (sunucu/ilk boyamada varsayılan). */
export function useLiveNotifyPrefs(): LiveNotifyPrefs {
  return useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_LIVE_NOTIFY_PREFS);
}
