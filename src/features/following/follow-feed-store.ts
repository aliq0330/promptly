"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_FOLLOW_FEED_SETTINGS,
  fetchFollowFeedSettings,
  updateFollowFeedSettings,
  type FollowFeedSettings,
} from "@/lib/supabase/following-activity";

/**
 * Takip akışının paylaşılan durumu (docs/history/451-*): kişinin akış tercihleri, Ana Sayfa'da açık sekme ve akışı yeniden yüklemek için bir
 * sayaç. Sağ sütundaki anahtarlar, telefondaki süzgeç penceresi ve akışın kendisi AYNI değeri okur; bir anahtar değişince akış baştan yüklenir.
 * Kimlik değişince sayfa baştan yüklendiği için (CLAUDE.md §8.10) ayrıca temizlenmez.
 */
type HomeTab = "forYou" | "following";

interface State {
  settings: FollowFeedSettings;
  loaded: boolean;
  tab: HomeTab;
  reload: number;
}

let state: State = { settings: DEFAULT_FOLLOW_FEED_SETTINGS, loaded: false, tab: "forYou", reload: 0 };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFollowFeedState(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Tercihleri bir kez yükler (oturumlu kişi için). */
export function useFollowFeedSettings(enabled: boolean) {
  const current = useFollowFeedState();
  useEffect(() => {
    if (!enabled || state.loaded || loading) return;
    loading = fetchFollowFeedSettings()
      .then((settings) => emit({ settings, loaded: true }))
      .catch(() => emit({ loaded: true }))
      .finally(() => {
        loading = null;
      });
  }, [enabled]);
  return current;
}

/** Bir tercihi değiştirir: önce ekranda (iyimser), sonra sunucuda; sunucu reddederse eski değere döner. Akış yeniden yüklenir. */
export async function changeFollowFeedSetting(patch: Partial<FollowFeedSettings>): Promise<boolean> {
  const previous = state.settings;
  emit({ settings: { ...previous, ...patch }, reload: state.reload + 1 });
  try {
    await updateFollowFeedSettings(patch);
    return true;
  } catch {
    emit({ settings: previous, reload: state.reload + 1 });
    return false;
  }
}

export function setHomeTab(tab: HomeTab) {
  if (state.tab !== tab) emit({ tab });
}

/** Kişi modu ya da takip değişince akışı yeniden yükletir. */
export function reloadFollowFeed() {
  emit({ reload: state.reload + 1 });
}
