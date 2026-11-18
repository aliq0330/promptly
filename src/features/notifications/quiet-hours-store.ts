"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchMyQuietHours, saveMyQuietHours } from "@/lib/supabase/quiet-hours";
import { DEFAULT_QUIET_HOURS, isQuietNow, type QuietHours } from "@/lib/live-notification-prefs";

/**
 * Rahatsız etme saatleri (docs/history/435-*) — hesap başına, veritabanında (Telegram'ı da susturur); burada oturum boyu önbellek. Modül tekili: kimlik değişince
 * sayfa baştan yüklenir (CLAUDE.md §8.10). Okunamazsa kural "kapalı" sayılır (bildirim/kart engellenmez); kaydedilemezse eski değer geri gelir ve fırlatır.
 */
let current: QuietHours = DEFAULT_QUIET_HOURS;
let loaded = false;
let loading: Promise<void> | null = null;
let loadedAt = 0;
const listeners = new Set<() => void>();
const REFRESH_MS = 10 * 60 * 1000;

function set(next: QuietHours, markLoaded = true) {
  current = next;
  if (markLoaded) {
    loaded = true;
    loadedAt = Date.now();
  }
  for (const fn of listeners) fn();
}

/** İlk kullanımda (ve 10 dakikadan eskiyse) sunucudan okur. Hata sessizdir: önceki/varsayılan değer kalır. */
export async function ensureQuietHours(force = false): Promise<void> {
  if (!force && loaded && Date.now() - loadedAt < REFRESH_MS) return;
  if (!loading) {
    loading = fetchMyQuietHours()
      .then((q) => set(q))
      .catch((err) => console.error("quiet hours", err))
      .finally(() => {
        loading = null;
      });
  }
  await loading;
}

export function getQuietHours(): QuietHours {
  return current;
}

/** Şu an sessiz saatte miyiz (önbellekteki kuralla). */
export function isQuietHoursNow(at: Date = new Date()): boolean {
  return isQuietNow(current, at);
}

export async function saveQuietHours(next: QuietHours): Promise<void> {
  const before = current;
  set(next);
  try {
    set(await saveMyQuietHours(next));
  } catch (err) {
    set(before);
    throw err;
  }
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** Ayarlar sayfası için: kural + yüklendi mi + kaydet. */
export function useQuietHours(): { quiet: QuietHours; loaded: boolean; save: (next: QuietHours) => Promise<void> } {
  const { user } = useAuth();
  const quiet = useSyncExternalStore(subscribe, getQuietHours, () => DEFAULT_QUIET_HOURS);
  const isLoaded = useSyncExternalStore(subscribe, () => loaded, () => false);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId) void ensureQuietHours();
  }, [userId]);
  const save = useCallback((next: QuietHours) => saveQuietHours(next), []);
  return { quiet, loaded: isLoaded, save };
}
