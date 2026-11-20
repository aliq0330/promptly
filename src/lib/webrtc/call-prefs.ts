/**
 * Cihaza özel arama tercihleri (docs/history/450-*): zil sesi, rahatsız etme saatlerine uyma, sekme arka plandayken tarayıcı bildirimi,
 * varsayılan mikrofon/kamera/hoparlör. Tarayıcıda (`localStorage`) tutulur, sunucuya gitmez; hesap düzeyi ayarlar (kim arayabilir, cevapsız
 * bildirimi) veritabanındadır. SAF kısım: ayrıştırma + "çalma sesi/uyarı gösterilsin mi" kararı (`npm test` ile sınanır).
 */
import { CALL_DEVICES_KEY, parseDevicePrefs } from "./call-rules.ts";
import type { CallDevicePrefs } from "./types.ts";

export const CALL_PREFS_KEY = "promptly-call-prefs";

export interface LocalCallPrefs {
  /** Gelen aramada zil çal. */
  ringSound: boolean;
  /** Rahatsız etme saatlerinde (hesap ayarı) zil ve tarayıcı bildirimi sessiz. */
  respectQuietHours: boolean;
  /** Sekme arka plandayken tarayıcı bildirimi + sekme başlığı uyarısı. */
  browserNotify: boolean;
}

export const DEFAULT_LOCAL_CALL_PREFS: LocalCallPrefs = { ringSound: true, respectQuietHours: true, browserNotify: true };

export function parseLocalCallPrefs(raw: string | null): LocalCallPrefs {
  if (!raw) return DEFAULT_LOCAL_CALL_PREFS;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return DEFAULT_LOCAL_CALL_PREFS;
    const o = v as Record<string, unknown>;
    const b = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
    return { ringSound: b(o.ringSound, true), respectQuietHours: b(o.respectQuietHours, true), browserNotify: b(o.browserNotify, true) };
  } catch {
    return DEFAULT_LOCAL_CALL_PREFS;
  }
}

export interface IncomingAlertInput {
  prefs: LocalCallPrefs;
  /** Rahatsız etme saatleri içindeyiz. */
  quietNow: boolean;
  /** Durumum "Görünmez". */
  invisible: boolean;
  /** Sekme arka planda (`document.hidden`). */
  tabHidden: boolean;
  /** Tarayıcı bildirim izni verilmiş mi (`Notification.permission === "granted"`). */
  notifyGranted: boolean;
}

export interface IncomingAlert {
  /** Zil sesi çalsın. */
  ring: boolean;
  /** Tarayıcı bildirimi (OS) gösterilsin. */
  notify: boolean;
  /** Sekme başlığında "Gelen arama" uyarısı. */
  title: boolean;
}

/**
 * Gelen aramada hangi uyarılar çalışır? Arama kartı HER ZAMAN görünür (karar yalnız ses/bildirim/başlık içindir). Sessiz saat ve
 * "Görünmez" zili ve OS bildirimini susturur; başlık uyarısı yalnız sekme arka plandayken anlamlıdır ve sessiz saatte de çalışmaz.
 */
export function incomingAlert(input: IncomingAlertInput): IncomingAlert {
  const silent = (input.prefs.respectQuietHours && input.quietNow) || input.invisible;
  return {
    ring: input.prefs.ringSound && !silent,
    notify: input.prefs.browserNotify && input.tabHidden && input.notifyGranted && !silent,
    title: input.prefs.browserNotify && input.tabHidden && !silent,
  };
}

export function readLocalCallPrefs(): LocalCallPrefs {
  try {
    return parseLocalCallPrefs(window.localStorage.getItem(CALL_PREFS_KEY));
  } catch {
    return DEFAULT_LOCAL_CALL_PREFS;
  }
}

export function writeLocalCallPrefs(next: LocalCallPrefs): void {
  try {
    window.localStorage.setItem(CALL_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* depolama kapalı: tercih bu oturumda uygulanmaz */
  }
}

export function readCallDevices(): CallDevicePrefs {
  try {
    return parseDevicePrefs(window.localStorage.getItem(CALL_DEVICES_KEY));
  } catch {
    return { mic: null, camera: null, speaker: null };
  }
}

export function writeCallDevices(next: CallDevicePrefs): void {
  try {
    window.localStorage.setItem(CALL_DEVICES_KEY, JSON.stringify(next));
  } catch {
    /* yok say */
  }
}
