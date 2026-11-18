"use client";

import { useSyncExternalStore } from "react";
import { LIVE_TOAST_PREF_KEY, parseLiveToastPref } from "@/lib/live-notification-toast";

/**
 * Canlı bildirim kartı tercihi (docs/history/434-*): Ayarlar → Bildirimler'deki anahtar. Cihaz başınadır (`localStorage`; telefonda kapatıp bilgisayarda
 * açık tutabilirsin) ve yazılmamışsa AÇIKTIR. Depolama yazılamazsa (özel pencere, kota) oturum boyu bellekte tutulur. Bildirimin kendisi etkilenmez:
 * kapalıyken de bildirim gelen kutusuna düşer, zil rozeti artar, Telegram'a gider — yalnız sitedeyken çıkan kart yoktur.
 */
const CHANGE_EVENT = "promptly:live-toasts";
let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try {
    return parseLiveToastPref(window.localStorage.getItem(LIVE_TOAST_PREF_KEY));
  } catch {
    return true;
  }
}

export function setLiveToastsEnabled(on: boolean): void {
  memory = on;
  try {
    if (on) window.localStorage.removeItem(LIVE_TOAST_PREF_KEY);
    else window.localStorage.setItem(LIVE_TOAST_PREF_KEY, "off");
  } catch {
    // Yazılamadı: tercih bu sekmede bellekte kalır.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(notify: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LIVE_TOAST_PREF_KEY || event.key === null) {
      memory = null;
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
  return useSyncExternalStore(subscribe, read, () => true);
}
