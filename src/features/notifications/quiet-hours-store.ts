"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchMyQuietHours, saveMyQuietHours } from "@/lib/supabase/quiet-hours";
import { DEFAULT_QUIET_HOURS, isQuietNow, type QuietHours } from "@/lib/live-notification-prefs";
import { readSnapshot, writeSnapshot } from "@/lib/feed-snapshot";

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

/** Bu cihazdaki kişiye özel kopya (docs/history/466-*): her tam sayfa yüklemesinde aynı kural yeniden sorulmasın; 10 dk geçerli. */
const SNAPSHOT_KEY = "quiet-hours";

/**
 * İlk kullanımda (ve 10 dakikadan eskiyse) sunucudan okur. `userId` verilirse önce bu cihazdaki 10 dakikalık kopyaya bakılır (sayfa yeniden
 * yüklenince istek atılmaz). Hata sessizdir: önceki/varsayılan değer kalır.
 */
export async function ensureQuietHours(force = false, userId: string | null = null): Promise<void> {
  if (!force && loaded && Date.now() - loadedAt < REFRESH_MS) return;
  if (!force && !loaded && userId) {
    const saved = readSnapshot<QuietHours>(userId, SNAPSHOT_KEY, { maxAgeMs: REFRESH_MS });
    if (saved) {
      current = saved.data;
      loaded = true;
      loadedAt = saved.savedAt;
      for (const fn of listeners) fn();
      return;
    }
  }
  if (!loading) {
    loading = fetchMyQuietHours()
      .then((q) => {
        set(q);
        if (userId) writeSnapshot(userId, SNAPSHOT_KEY, q);
      })
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

export async function saveQuietHours(next: QuietHours, savedFor: string | null = null): Promise<void> {
  const before = current;
  set(next);
  try {
    const saved = await saveMyQuietHours(next);
    set(saved);
    if (savedFor) writeSnapshot(savedFor, SNAPSHOT_KEY, saved);
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
    if (userId) void ensureQuietHours(false, userId);
  }, [userId]);
  const save = useCallback((next: QuietHours) => saveQuietHours(next, userId), [userId]);
  return { quiet, loaded: isLoaded, save };
}
