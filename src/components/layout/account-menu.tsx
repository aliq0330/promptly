"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, LayoutGrid, LogIn, LogOut, Moon, Settings, ShieldCheck, User, UserPlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { useTheme } from "@/components/theme/theme-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, profileHref } from "@/lib/utils";

/** Open/close state + outside-click, Escape (returns focus to the trigger) and route-change handling shared by both menus. */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, close, rootRef, triggerRef };
}

const PANEL_CLASS =
  "absolute right-0 top-11 z-40 w-[min(18.5rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-xl border border-border-soft bg-surface-elevated shadow-pop animate-pop-in";

const ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-small font-medium text-text transition-colors duration-200 hover:bg-surface-soft focus-visible:bg-surface-soft";

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="px-1.5 py-1.5">
      <p className="px-3 pb-1 pt-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      {children}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label, onNavigate }: { href: string; icon: LucideIcon; label: string; onNavigate: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} className={ITEM_CLASS}>
      <Icon size={17} className="shrink-0 text-text-secondary" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * The signed-in avatar dropdown: identity header, "Hesabım" and "Tercihler"
 * groups, sign out. Notifications and Messages deliberately stay in the top
 * bar (see `Header`). Rendered only for an authenticated member.
 */
export function AccountMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const { profile } = useOwnProfile();
  const { theme, toggleTheme } = useTheme();
  const isModerator = useIsModerator();
  const { open, setOpen, close, rootRef, triggerRef } = useDropdown();
  const [signingOut, setSigningOut] = useState(false);

  if (!profile) {
    // Own profile still resolving: hold the avatar's space so nothing shifts.
    return <span aria-hidden className="ml-1.5 h-9 w-9 shrink-0 rounded-full bg-surface-soft" />;
  }

  const ownProfileHref = profileHref(profile);
  const isDark = theme === "dark";

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      close();
      router.push("/");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div ref={rootRef} className="relative ml-1.5 shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("account.menuAriaLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn("block rounded-full transition-shadow duration-200", open && "ring-2 ring-primary/40")}
      >
        <Avatar src={profile.avatarUrl} alt={profile.displayName} size={36} />
      </button>

      {open && (
        <div role="menu" aria-label={t("account.menuAriaLabel")} className={PANEL_CLASS}>
          <div className="flex items-center gap-3 border-b border-border-soft p-4">
            <Avatar src={profile.avatarUrl} alt="" size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-semibold text-text">{profile.displayName}</p>
              <p className="truncate text-caption text-text-muted">@{profile.username}</p>
            </div>
            <Link
              href={ownProfileHref}
              onClick={close}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-caption font-semibold text-text transition-colors duration-200 hover:bg-surface-soft"
            >
              {t("account.myProfile")}
            </Link>
          </div>

          <MenuGroup label={t("account.groupAccount")}>
            <MenuLink href={ownProfileHref} icon={User} label={t("account.myProfile")} onNavigate={close} />
            <MenuLink href="/my-content" icon={LayoutGrid} label={t("account.myContent")} onNavigate={close} />
            <MenuLink href="/saved" icon={Bookmark} label={t("nav.saved")} onNavigate={close} />
            <MenuLink href="/following" icon={Users} label={t("nav.following")} onNavigate={close} />
          </MenuGroup>

          <div className="border-t border-border-soft" />

          <MenuGroup label={t("settings.groupPreferences")}>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={isDark}
              aria-label={t("account.nightModeAria", { state: isDark ? t("account.on") : t("account.off") })}
              onClick={toggleTheme}
              className={ITEM_CLASS}
            >
              <Moon size={17} className="shrink-0 text-text-secondary" />
              <span className="flex-1 truncate">{t("account.nightMode")}</span>
              <span
                aria-hidden
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
                  isDark ? "bg-primary" : "bg-border-strong",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-xs transition-[left] duration-200",
                    isDark ? "left-[1.125rem]" : "left-0.5",
                  )}
                />
              </span>
            </button>
            <MenuLink href="/settings" icon={Settings} label={t("nav.settings")} onNavigate={close} />
            {isModerator && <MenuLink href="/moderation" icon={ShieldCheck} label={t("nav.moderation")} onNavigate={close} />}
          </MenuGroup>

          <div className="border-t border-border-soft p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className={cn(ITEM_CLASS, "text-danger disabled:opacity-60")}
            >
              <LogOut size={17} className="shrink-0" />
              <span>{signingOut ? t("settings.signingOut") : t("settings.signOut")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What a guest sees instead of an account menu: "Giriş Yap" and "Kayıt Ol"
 * side by side from `sm` up, and on phones a single button that opens a small
 * menu with the same two options (the header is too tight for both labels).
 */
export function GuestAuthMenu() {
  const { t } = useTranslation();
  const { open, setOpen, close, rootRef, triggerRef } = useDropdown();

  return (
    <>
      <div className="ml-1.5 hidden shrink-0 items-center gap-1.5 sm:flex">
        <Link
          href="/login"
          className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-label font-semibold text-text transition-colors duration-200 hover:bg-surface-soft"
        >
          <LogIn size={16} />
          {t("header.login")}
        </Link>
        <Link
          href="/signup"
          className="flex h-9 items-center gap-1.5 rounded-md bg-text px-3 text-label font-semibold text-background transition-opacity duration-200 hover:opacity-90"
        >
          <UserPlus size={16} />
          {t("auth.signUp")}
        </Link>
      </div>

      <div ref={rootRef} className="relative ml-1 shrink-0 sm:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={t("account.guestMenuAriaLabel")}
          aria-haspopup="menu"
          aria-expanded={open}
          className={iconButtonClassName(open, "shrink-0")}
        >
          <User size={20} />
        </button>
        {open && (
          <div role="menu" aria-label={t("account.guestMenuAriaLabel")} className={cn(PANEL_CLASS, "w-52 p-1.5")}>
            <MenuLink href="/login" icon={LogIn} label={t("header.login")} onNavigate={close} />
            <MenuLink href="/signup" icon={UserPlus} label={t("auth.signUp")} onNavigate={close} />
          </div>
        )}
      </div>
    </>
  );
}
