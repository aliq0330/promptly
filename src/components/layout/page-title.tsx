"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/language-provider";
import { routeTitleKey } from "@/lib/phone-chrome";
import { badgedTitle } from "@/lib/tab-badge";

const SITE = "Promptly";

// A page that knows its own content title (a prompt, a request…) publishes it
// here; the root-level <PageTitle/> picks it up. Module-level on purpose: the
// app is a static export, so there is one JS module instance per tab.
let override: string | null = null;
const listeners = new Set<() => void>();
function setOverride(next: string | null) {
  if (override === next) return;
  override = next;
  listeners.forEach((l) => l());
}

// Okunmamış bildirim sayısı (docs/history/435-*): sekme başlığının önüne `(3) ` olarak konur. Başlığın TEK sahibi bu bileşendir (aşağıdaki gözlemci başlığı kendi
// değerine geri çevirir): rozet ayrı bir gözlemciyle eklenseydi ikisi birbirini sonsuza kadar geri yazardı.
let badge = 0;
const badgeListeners = new Set<() => void>();
export function setTitleBadge(next: number) {
  const value = Math.max(0, Math.floor(next));
  if (badge === value) return;
  badge = value;
  badgeListeners.forEach((l) => l());
}

// Gelen arama uyarısı (docs/history/450-*): sekme arka plandayken başlığın önüne "Gelen arama · " konur. Rozet gibi başlığın TEK sahibi bu bileşendir.
let callAlert: string | null = null;
const callAlertListeners = new Set<() => void>();
export function setTitleCallAlert(next: string | null) {
  if (callAlert === next) return;
  callAlert = next;
  callAlertListeners.forEach((l) => l());
}

/** Set the browser-tab title for a detail page. Pass nothing while loading. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    setOverride(title?.trim() || null);
    return () => setOverride(null);
  }, [title]);
}

/** Keeps `document.title` in step with the route (and language), site-wide. */
export function PageTitle() {
  const { t } = useTranslation();
  const pathname = usePathname() || "/";
  const custom = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => override,
    () => null,
  );

  const unread = useSyncExternalStore(
    (cb) => {
      badgeListeners.add(cb);
      return () => badgeListeners.delete(cb);
    },
    () => badge,
    () => 0,
  );

  const alertText = useSyncExternalStore(
    (cb) => {
      callAlertListeners.add(cb);
      return () => callAlertListeners.delete(cb);
    },
    () => callAlert,
    () => null,
  );

  const key = routeTitleKey(pathname);

  useEffect(() => {
    const base = custom ?? (key ? t(key) : null);
    const wanted0 = badgedTitle(base && base !== SITE ? `${base} · ${SITE}` : SITE, unread);
    const wanted = alertText ? `${alertText} · ${wanted0}` : wanted0;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    // Next's own <title> (from `metadata`) is hoisted into <head> and may be
    // re-applied after we run (streamed metadata boundary) — keep ours on top.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [custom, key, t, unread, alertText]);

  return null;
}
