"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, BarChart3, Bookmark, LayoutGrid, LogIn, LogOut, Moon, Settings, Shapes, ShieldCheck, Undo2, User, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { useTheme } from "@/components/theme/theme-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
import { useTranslation } from "@/lib/i18n/language-provider";
import { hasSwitchOrigin, returnToOwnAccount, SWITCH_OWNER_USERNAME } from "@/lib/supabase/account-switch";
import { cn, profileHref } from "@/lib/utils";
import { SwitchAccountModal } from "./switch-account-modal";

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
  "absolute right-0 top-11 z-40 w-[min(15rem,calc(100vw-1.5rem))] md:w-[min(18.5rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-xl border border-border-soft bg-surface-elevated shadow-pop animate-pop-in";

const ITEM_CLASS =
  "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left md:min-h-11 md:gap-3 md:px-3 text-small font-medium text-text transition-colors duration-200 hover:bg-surface-soft focus-visible:bg-surface-soft";

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="px-1 py-1 md:px-1.5 md:py-1.5">
      <p className="hidden px-3 pb-1 pt-1.5 text-caption md:block font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      {children}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label, onNavigate }: { href: string; icon: LucideIcon; label: string; onNavigate: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} className={ITEM_CLASS}>
      <Icon size={16} className="shrink-0 text-text-secondary" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function FooterLink({ href, label, onNavigate }: { href: string; label: string; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="min-h-7 content-center text-caption text-text-muted underline-offset-2 transition-colors duration-200 hover:text-text hover:underline focus-visible:text-text focus-visible:underline"
    >
      {label}
    </Link>
  );
}

/**
 * The signed-in avatar dropdown: identity header, "Hesabım" and "Tercihler"
 * groups, role-bound rows (moderation / account switching), sign out and a
 * quiet footer row of developer + legal links. Notifications and Messages deliberately stay in the top
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
  const [switchOpen, setSwitchOpen] = useState(false);
  const [returning, setReturning] = useState(false);

  if (!profile) {
    // Own profile still resolving: hold the avatar's space so nothing shifts.
    return <span aria-hidden className="ml-1.5 h-9 w-9 shrink-0 rounded-full bg-surface-soft" />;
  }

  const ownProfileHref = profileHref(profile);
  const isDark = theme === "dark";
  // Yalnız menüyü gizler; asıl yetki `switch-account` Edge Function'ındadır.
  const canSwitch = isModerator && profile.username === SWITCH_OWNER_USERNAME;
  const canReturn = hasSwitchOrigin() && !canSwitch;

  async function handleReturn() {
    setReturning(true);
    try {
      await returnToOwnAccount();
      close();
    } catch {
      close();
      router.push("/login");
    } finally {
      setReturning(false);
    }
  }

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
        <div
          role="menu"
          aria-label={t("account.menuAriaLabel")}
          className={cn(PANEL_CLASS, "max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain")}
        >
          <Link
            href={ownProfileHref}
            onClick={close}
            aria-label={t("account.myProfile")}
            className="flex items-center gap-2.5 border-b border-border-soft px-3 py-2.5 transition-colors duration-200 hover:bg-surface-soft md:gap-3 md:p-4"
          >
            <Avatar src={profile.avatarUrl} alt="" size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-semibold text-text">{profile.displayName}</p>
              <p className="truncate text-caption text-text-muted">@{profile.username}</p>
            </div>
          </Link>

          <MenuGroup label={t("account.groupAccount")}>
            <MenuLink href="/my-content" icon={LayoutGrid} label={t("account.myContent")} onNavigate={close} />
            <MenuLink href="/saved" icon={Bookmark} label={t("nav.saved")} onNavigate={close} />
            <MenuLink href="/spaces" icon={Shapes} label={t("nav.spaces")} onNavigate={close} />
            <MenuLink href="/insights" icon={BarChart3} label={t("nav.insights")} onNavigate={close} />
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
          </MenuGroup>

          {/* Role-bound rows (moderator / account switching): a normal member never sees this group or its divider. */}
          {(isModerator || canSwitch || canReturn) && (
            <div className="border-t border-border-soft p-1 md:p-1.5">
              {isModerator && <MenuLink href="/moderation" icon={ShieldCheck} label={t("nav.moderation")} onNavigate={close} />}
              {canSwitch && (
                <button type="button" role="menuitem" onClick={() => { close(); setSwitchOpen(true); }} className={ITEM_CLASS}>
                  <ArrowLeftRight size={17} className="shrink-0 text-text-secondary" />
                  <span>{t("accountSwitch.menuItem")}</span>
                </button>
              )}
              {canReturn && (
                <button type="button" role="menuitem" onClick={handleReturn} disabled={returning} className={cn(ITEM_CLASS, "disabled:opacity-60")}>
                  <Undo2 size={17} className="shrink-0 text-text-secondary" />
                  <span>{t("accountSwitch.returnItem")}</span>
                </button>
              )}
            </div>
          )}

          <div className="border-t border-border-soft p-1 md:p-1.5">
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

          {/* Rarely used links as one quiet text row (developers + legal, docs/history/300-*, 301-*): phones have no sidebar, so they live here. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-soft px-3.5 py-2.5 md:px-4">
            <FooterLink href="/developers" label={t("dev.title")} onNavigate={close} />
            <div role="group" aria-label={t("legal.groupTitle")} className="contents">
              <FooterLink href="/terms" label={t("legal.termsTitle")} onNavigate={close} />
              <FooterLink href="/privacy" label={t("legal.privacyTitle")} onNavigate={close} />
            </div>
          </div>
        </div>
      )}
      {switchOpen && <SwitchAccountModal currentUserId={profile.id} onClose={() => setSwitchOpen(false)} />}
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
