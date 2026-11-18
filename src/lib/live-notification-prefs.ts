import type { NotificationType } from "../types/index.ts";

/**
 * Canlı bildirim tercihleri (docs/history/435-*) — SAF kurallar: hangi tür kart çıkar, sessiz saat penceresi, yoğunlukta özet kartı eşiği.
 * Ana anahtar (`promptly-live-toasts`, docs/history/434-*) ayrı kalır; burası ince ayardır ve hep CİHAZ başınadır (`localStorage`), yalnız sessiz saatler hesap
 * başınadır (veritabanı, Telegram'ı da susturduğu için; SQL aynası `_in_quiet_hours`, `live-notification-prefs.test.ts` + `supabase/tests/notification-quiet-hours.sql`
 * aynı örnekleri sınar).
 */

/** Kart tercihinin tür grupları (Ayarlar'da bir anahtar = bir grup). */
export const LIVE_TOAST_GROUPS = ["reactions", "comments", "follows", "messages", "other"] as const;
export type LiveToastGroup = (typeof LIVE_TOAST_GROUPS)[number];

/** Bildirim türü → kart grubu. Bilinmeyen/yeni tür "other"a düşer (kart çıkar; kullanıcı "Diğer" anahtarıyla kapatır). */
export function liveToastGroupOf(type: NotificationType | string): LiveToastGroup {
  switch (type) {
    case "like":
    case "story_reaction":
    case "story_poll_vote":
      return "reactions";
    case "comment":
    case "comment_reply":
    case "story_question_answer":
      return "comments";
    case "follow":
      return "follows";
    case "message":
    case "message_request":
      return "messages";
    default:
      return "other";
  }
}

export interface LiveNotifyPrefs {
  /** Hangi gruptan gelen bildirim kart olarak çıksın (varsayılan hepsi). */
  types: Record<LiveToastGroup, boolean>;
  /** Kart çıkınca kısa bir ses çalsın (varsayılan KAPALI: ses sürpriz olmamalı). */
  sound: boolean;
  /** Sekme başlığında `(3)` ve simgede rozet (varsayılan AÇIK). */
  tabBadge: boolean;
}

export const LIVE_NOTIFY_PREFS_KEY = "promptly-live-toast-prefs";

export const DEFAULT_LIVE_NOTIFY_PREFS: LiveNotifyPrefs = {
  types: { reactions: true, comments: true, follows: true, messages: true, other: true },
  sound: false,
  tabBadge: true,
};

/** `localStorage` metnini okur; bozuk/eksik alan varsayılana döner (tercih okunamadı diye kart hiç çıkmaz hâle gelmesin). */
export function parseLiveNotifyPrefs(raw: string | null | undefined): LiveNotifyPrefs {
  const base: LiveNotifyPrefs = { ...DEFAULT_LIVE_NOTIFY_PREFS, types: { ...DEFAULT_LIVE_NOTIFY_PREFS.types } };
  if (!raw) return base;
  try {
    const value = JSON.parse(raw) as Partial<{ types: Record<string, unknown>; sound: unknown; tabBadge: unknown }> | null;
    if (!value || typeof value !== "object") return base;
    for (const group of LIVE_TOAST_GROUPS) {
      if (value.types && typeof value.types[group] === "boolean") base.types[group] = value.types[group] as boolean;
    }
    if (typeof value.sound === "boolean") base.sound = value.sound;
    if (typeof value.tabBadge === "boolean") base.tabBadge = value.tabBadge;
    return base;
  } catch {
    return base;
  }
}

export function serializeLiveNotifyPrefs(prefs: LiveNotifyPrefs): string {
  return JSON.stringify({ types: prefs.types, sound: prefs.sound, tabBadge: prefs.tabBadge });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Sessiz saatler (Rahatsız etme)
// ---------------------------------------------------------------------------------------------------------------------------------------------

export interface QuietHours {
  enabled: boolean;
  /** Gece yarısından itibaren dakika (0–1439). */
  startMinute: number;
  endMinute: number;
  /** IANA saat dilimi (tarayıcıdan). */
  tz: string;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, startMinute: 23 * 60, endMinute: 8 * 60, tz: "UTC" };

/** Dakika → "HH:MM" (`<input type="time">` değeri). */
export function minutesToTime(minute: number): string {
  const m = Math.min(1439, Math.max(0, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:MM" → dakika; geçersizse `null`. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}

/** Bir anın `tz` saat dilimindeki gece yarısından beri dakikası; saat dilimi tanınmazsa `null`. */
export function localMinuteOfDay(at: Date, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    return Number.isFinite(h) && Number.isFinite(m) ? (h % 24) * 60 + m : null;
  } catch {
    return null;
  }
}

/** Şu an sessiz saatte miyiz (SQL `_in_quiet_hours` ile aynı kural): kapalı/başlangıç = bitiş/saat dilimi okunamadı → hayır; başlangıç > bitiş → gece yarısını aşar; bitiş hariç. */
export function isQuietNow(q: QuietHours, at: Date = new Date()): boolean {
  if (!q.enabled || q.startMinute === q.endMinute) return false;
  const minute = localMinuteOfDay(at, q.tz);
  if (minute === null) return false;
  return q.startMinute < q.endMinute ? minute >= q.startMinute && minute < q.endMinute : minute >= q.startMinute || minute < q.endMinute;
}

/** Sunucunun satırı (`get_my_quiet_hours`) → arayüz biçimi; bozuk satır varsayılan (kapalı) olur. */
export function parseQuietHoursRow(row: unknown): QuietHours {
  if (!row || typeof row !== "object") return { ...DEFAULT_QUIET_HOURS };
  const r = row as Record<string, unknown>;
  const minute = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1439 ? v : fallback);
  return {
    enabled: r.enabled === true,
    startMinute: minute(r.start_minute, DEFAULT_QUIET_HOURS.startMinute),
    endMinute: minute(r.end_minute, DEFAULT_QUIET_HOURS.endMinute),
    tz: typeof r.tz === "string" && r.tz ? r.tz : DEFAULT_QUIET_HOURS.tz,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Yoğunlukta özet kartı
// ---------------------------------------------------------------------------------------------------------------------------------------------

/** Bu süre içinde bu kadar bildirim gelirse tek tek kart yerine tek özet kartı çıkar. */
export const LIVE_TOAST_BURST_WINDOW_MS = 10_000;
export const LIVE_TOAST_BURST_THRESHOLD = 5;

/** Pencere dışına düşen varışları atar; yeni varışı ekler. */
export function pushArrival(arrivals: readonly number[], now: number): number[] {
  return [...arrivals.filter((at) => now - at < LIVE_TOAST_BURST_WINDOW_MS), now];
}

export function isBurst(arrivals: readonly number[]): boolean {
  return arrivals.length >= LIVE_TOAST_BURST_THRESHOLD;
}
