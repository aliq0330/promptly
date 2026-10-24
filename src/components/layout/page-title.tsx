"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const SITE = "Promptly";

/** Route (basePath-less, no trailing slash) → translation key of its title. */
const ROUTE_TITLES: Record<string, TranslationKey> = {
  "/": "nav.home",
  "/discover": "nav.discover",
  "/focus": "nav.focus",
  "/prompts": "nav.prompts",
  "/requests": "nav.requests",
  "/requests/new": "nav.createPrompt",
  "/workflows": "nav.workflows",
  "/workflows/create": "nav.workflows",
  "/presets": "nav.presets",
  "/presets/create": "nav.presets",
  "/tags": "nav.tags",
  "/saved": "nav.saved",
  "/following": "nav.followingPeople",
  "/followers": "nav.followers",
  "/settings": "nav.settings",
  "/settings/blocked": "nav.settings",
  "/create": "nav.createPrompt",
  "/studio": "nav.studio",
  "/generate": "nav.studio",
  "/moderation": "moderation.title",
  "/my-content": "myContent.title",
  "/relations": "relations.title",
  "/profile/edit": "profile.editProfileHeading",
  "/messages": "header.messagesAriaLabel",
  "/messages/local": "header.messagesAriaLabel",
  "/groups": "nav.communities",
  "/groups/join": "nav.communities",
  "/communities": "nav.communities",
  "/communities/join": "nav.communities",
  "/communities/local": "nav.communities",
  "/notifications": "header.notificationsAriaLabel",
  "/login": "header.login",
  "/signup": "auth.signUp",
  "/reset-password": "auth.resetPasswordTitle",
};

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

  const clean = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const key = ROUTE_TITLES[clean];

  useEffect(() => {
    const base = custom ?? (key ? t(key) : null);
    const wanted = base && base !== SITE ? `${base} · ${SITE}` : SITE;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    // Next's own <title> (from `metadata`) is hoisted into <head> and may be
    // re-applied after we run (streamed metadata boundary) — keep ours on top.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [custom, key, t]);

  return null;
}
