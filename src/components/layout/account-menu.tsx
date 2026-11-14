"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "@/components/icons/arrow-left-right";
import { ChevronRight } from "@/components/icons/chevron-right";
import { ChevronUp } from "@/components/icons/chevron-up";
import { Globe } from "@/components/icons/globe";
import { Sun } from "@/components/icons/sun";
import { LogIn } from "@/components/icons/log-in";
import { LogOut } from "@/components/icons/log-out";
import { Moon } from "@/components/icons/moon";
import { Settings } from "@/components/icons/settings";
import { ShieldCheck } from "@/components/icons/shield-check";
import { Undo2 } from "@/components/icons/undo-2";
import { User } from "@/components/icons/user";
import { UserPlus } from "@/components/icons/user-plus";
import { Library } from "@/components/icons/library";
import type { IconComponent } from "@/components/icons/icon";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { useTheme } from "@/components/theme/theme-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
import { useTranslation } from "@/lib/i18n/language-provider";
import { hasSwitchOrigin, returnToOwnAccount, SWITCH_OWNER_USERNAME } from "@/lib/supabase/account-switch";
import { cn, profileHref } from "@/lib/utils";
import { accountShortcutItems, type NavItem } from "@/components/layout/nav-items";
import { SwitchAccountModal } from "./switch-account-modal";
import { OwnPresenceDot, PresenceMenuToggle } from "@/features/presence/presence-menu";

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

/** Açılır menü yüzeyi (konumu çağıran verir): kenar çubuğunda yukarı, rayda yana açılır; yüksekliği görünür alanı aşmaz (docs/history/387-*). */
const PANEL_CLASS =
  "absolute z-40 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-border-soft bg-surface-elevated shadow-pop animate-pop-in";
const PANEL_UP_CLASS = "bottom-full left-0 right-0 mb-2 origin-bottom";
const PANEL_SIDE_CLASS = "bottom-0 left-full ml-2 w-72 origin-bottom-left";

const ITEM_CLASS =
  "flex min-h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left md:min-h-11 md:gap-3 md:px-3 text-small font-medium text-text transition-colors duration-200 hover:bg-surface-soft focus-visible:bg-surface-soft";

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="px-1 py-1 md:px-1.5 md:py-1.5">
      <p className="hidden px-3 pb-1 pt-1.5 text-caption md:block font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      {children}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label, onNavigate }: { href: string; icon: IconComponent; label: string; onNavigate: () => void }) {
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

/** Hesap eylemleri tek yerde (docs/history/387-*): menü kapanınca bile yaşaması gereken durum (hesap değiştirme penceresi) sahibi bileşendedir. */
function useAccountActions(close: () => void) {
  const router = useRouter();
  const { signOut } = useAuth();
  const { profile } = useOwnProfile();
  const isModerator = useIsModerator();
  const [signingOut, setSigningOut] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [returning, setReturning] = useState(false);

  // Yalnız menüyü gizler; asıl yetki `switch-account` Edge Function'ındadır.
  const canSwitch = Boolean(profile) && isModerator && profile?.username === SWITCH_OWNER_USERNAME;
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

  const switchModal = switchOpen && profile ? <SwitchAccountModal currentUserId={profile.id} onClose={() => setSwitchOpen(false)} /> : null;
  return {
    profile,
    isModerator,
    canSwitch,
    canReturn,
    signingOut,
    returning,
    handleReturn,
    handleSignOut,
    openSwitch: () => {
      close();
      setSwitchOpen(true);
    },
    switchModal,
  };
}
type AccountActions = ReturnType<typeof useAccountActions>;

const SHEET_ITEM_CLASS = cn(ITEM_CLASS, "min-h-12 gap-3 px-3 text-body");

/** Profil adı + «Profilini gör» satırı (telefon sayfasının başı). */
function SheetProfileRow({ href, name, onNavigate }: { href: string; name: string; onNavigate: () => void }) {
  const { t } = useTranslation();
  const { profile } = useOwnProfile();
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} aria-label={t("account.myProfile")} className="flex items-center gap-3 px-5 pb-3 pt-4 transition-colors duration-200 hover:bg-surface-soft">
      <Avatar src={profile?.avatarUrl} alt={name} size={56} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-h3 font-bold text-text">{name}</span>
        <span className="block truncate text-small text-text-muted">{t("account.viewProfile")}</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-text-muted" />
    </Link>
  );
}

/** Telefondaki «Kısayollar» ızgarası: kenar çubuğundaki çalışma/kütüphane girişleri, 3 sütun. */
function ShortcutGrid({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="px-5 pb-2">
      <p className="mb-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("nav.shortcuts")}</p>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                role="menuitem"
                onClick={onNavigate}
                className="flex min-h-21 flex-col items-center justify-center gap-1 rounded-lg border border-border-soft bg-background px-1 text-center text-label font-semibold text-text transition-colors duration-200 hover:bg-surface-soft"
              >
                <Icon size={24} className="text-primary" />
                <span className="max-w-full truncate">{t(item.tileLabelKey ?? item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * «Sen» menüsünün satırları (docs/history/387-*): İçeriklerim · Ayarlar · Görünüm · Dil · çevrimiçi durumu · (rol satırları) · Çıkış · alt bağlantılar.
 * Telefon sayfası, rayın menüsü ve kenar çubuğunun menüsü AYNI satırları çizer; yalnız ölçü değişir.
 */
function AccountRows({ actions, close, sheet }: { actions: AccountActions; close: () => void; sheet?: boolean }) {
  const { t, language, setLanguage } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const itemClass = sheet ? SHEET_ITEM_CLASS : ITEM_CLASS;
  const iconSize = sheet ? 20 : 16;
  const iconClass = "shrink-0 text-text-secondary";
  const ThemeIcon = isDark ? Moon : Sun;
  return (
    <>
      <div className={sheet ? "px-3 py-1" : "px-1 py-1 md:px-1.5 md:py-1.5"}>
        <Link href="/my-content" role="menuitem" onClick={close} className={itemClass}>
          <Library size={iconSize} className={iconClass} />
          <span className="truncate">{t("account.myContent")}</span>
        </Link>
        <Link href="/settings" role="menuitem" onClick={close} className={itemClass}>
          <Settings size={iconSize} className={iconClass} />
          <span className="flex-1 truncate">{t("nav.settings")}</span>
        </Link>
        <button type="button" role="menuitem" onClick={toggleTheme} data-account-appearance className={itemClass}>
          <ThemeIcon size={iconSize} className={iconClass} />
          <span className="flex-1 truncate">{t("account.appearance")}</span>
          <span className="shrink-0 text-small font-normal text-text-muted">{isDark ? t("account.appearanceDark") : t("account.appearanceLight")}</span>
        </button>
        <button type="button" role="menuitem" onClick={() => setLanguage(language === "tr" ? "en" : "tr")} data-account-language className={itemClass}>
          <Globe size={iconSize} className={iconClass} />
          <span className="flex-1 truncate">{t("settings.languageTitle")}</span>
          <span className="shrink-0 text-small font-normal text-text-muted">{t("account.languageName")}</span>
        </button>
        {/* Hızlı durum değiştirme (docs/history/329-*): Görünmez ↔ Otomatik; kitle ayarı Gizlilik'te. */}
        <PresenceMenuToggle itemClassName={itemClass} onNavigate={close} />
      </div>

      {/* Role-bound rows (moderator / account switching): a normal member never sees this group or its divider. */}
      {(actions.isModerator || actions.canSwitch || actions.canReturn) && (
        <div className={cn("border-t border-border-soft", sheet ? "px-3 py-1" : "p-1 md:p-1.5")}>
          {actions.isModerator && (
            <Link href="/moderation" role="menuitem" onClick={close} className={itemClass}>
              <ShieldCheck size={iconSize} className={iconClass} />
              <span className="truncate">{t("nav.moderation")}</span>
            </Link>
          )}
          {actions.canSwitch && (
            <button type="button" role="menuitem" onClick={actions.openSwitch} className={itemClass}>
              <ArrowLeftRight size={iconSize} className={iconClass} />
              <span>{t("accountSwitch.menuItem")}</span>
            </button>
          )}
          {actions.canReturn && (
            <button type="button" role="menuitem" onClick={actions.handleReturn} disabled={actions.returning} className={cn(itemClass, "disabled:opacity-50")}>
              <Undo2 size={iconSize} className={iconClass} />
              <span>{t("accountSwitch.returnItem")}</span>
            </button>
          )}
        </div>
      )}

      <div className={cn("border-t border-border-soft", sheet ? "px-3 py-1" : "p-1 md:p-1.5")}>
        <button
          type="button"
          role="menuitem"
          onClick={actions.handleSignOut}
          disabled={actions.signingOut}
          className={cn(itemClass, "text-danger disabled:opacity-50")}
        >
          <LogOut size={iconSize} className="shrink-0" />
          <span>{actions.signingOut ? t("settings.signingOut") : t("settings.signOut")}</span>
        </button>
      </div>

      {/* Rarely used links as one quiet text row (developers + legal, docs/history/300-*, 301-*): the sidebar no longer repeats them. */}
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-soft py-2.5", sheet ? "justify-center px-5 pb-4" : "px-4")}>
        <FooterLink href="/developers" label={t("dev.title")} onNavigate={close} />
        <div role="group" aria-label={t("legal.groupTitle")} className="contents">
          <FooterLink href="/terms" label={t("legal.termsTitle")} onNavigate={close} />
          <FooterLink href="/privacy" label={t("legal.privacyTitle")} onNavigate={close} />
        </div>
      </div>
    </>
  );
}

/** Rayda/kenar çubuğunda açılan menünün gövdesi: profil başlığı, (rayda olmayan) kısayollar, satırlar. */
function PopoverBody({ actions, close, name, shortcuts }: { actions: AccountActions; close: () => void; name: string; shortcuts: NavItem[] }) {
  const { t } = useTranslation();
  const { profile } = useOwnProfile();
  if (!profile) return null;
  return (
    <>
      <Link
        href={profileHref(profile)}
        role="menuitem"
        onClick={close}
        aria-label={t("account.myProfile")}
        className="flex items-center gap-3 border-b border-border-soft p-3 transition-colors duration-200 hover:bg-surface-soft"
      >
        <Avatar src={profile.avatarUrl} alt={name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-text">{name}</p>
          <p className="truncate text-caption text-text-muted">@{profile.username}</p>
        </div>
      </Link>
      {shortcuts.length > 0 && (
        <>
          <MenuGroup label={t("nav.shortcuts")}>
            {shortcuts.map((item) => (
              <MenuLink key={item.href} href={item.href} icon={item.icon} label={t(item.labelKey)} onNavigate={close} />
            ))}
          </MenuGroup>
          <div className="border-t border-border-soft" />
        </>
      )}
      <AccountRows actions={actions} close={close} />
    </>
  );
}

/**
 * «Sen» — telefonda alt çubuğun son sekmesi (docs/history/387-*): avatar + etiket; basınca alttan «Sen» sayfası açılır
 * (profil, kısayol ızgarası, Ayarlar/Görünüm/Dil, çıkış). `className` alt çubuk öğesinin ortak görünümüdür.
 */
export function PhoneAccountTab({ active, className }: { active: boolean; className: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const actions = useAccountActions(close);
  const { profile } = actions;
  const id = useId();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("nav.youAria")} aria-haspopup="dialog" aria-expanded={open} data-nav-you="" className={className}>
        <Avatar src={profile?.avatarUrl} alt={profile?.displayName ?? ""} size={24} className={active || open ? "ring-2 ring-primary" : undefined} />
        <span>{t("nav.you")}</span>
      </button>
      {open && profile && (
        <Modal variant="sheet" onClose={close} labelledBy={id}>
          <div role="menu" aria-label={t("account.menuAriaLabel")} data-account-sheet="" className="flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-surface">
            <h2 id={id} className="sr-only">{t("nav.you")}</h2>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              <SheetProfileRow href={profileHref(profile)} name={profile.displayName} onNavigate={close} />
              <ShortcutGrid items={accountShortcutItems} onNavigate={close} />
              <AccountRows actions={actions} close={close} sheet />
            </div>
          </div>
        </Modal>
      )}
      {actions.switchModal}
    </>
  );
}

/** Rayın ve kenar çubuğunun «Sen» düğmesi + açılır menüsü ortak iskeleti. */
function useAnchoredAccount() {
  const { open, setOpen, close, rootRef, triggerRef } = useDropdown();
  const actions = useAccountActions(close);
  return { open, setOpen, close, rootRef, triggerRef, actions };
}

/** Tablet rayının en altı (md–lg): avatar + «Sen»; menü sağa, rayın üstüne açılır (rayda olmayan Takip/Panel/Studio kısayolları menüdedir). */
export function RailAccount() {
  const { t } = useTranslation();
  const { open, setOpen, close, rootRef, triggerRef, actions } = useAnchoredAccount();
  const { profile } = actions;
  if (!profile) return <span aria-hidden className="h-16 w-full" />;
  const shortcuts = accountShortcutItems.filter((item) => !item.rail);
  return (
    <div ref={rootRef} className="relative mt-auto w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("nav.youAria")}
        aria-haspopup="menu"
        aria-expanded={open}
        data-nav-you=""
        className={cn("flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg text-caption font-medium transition-colors duration-200 hover:bg-surface-soft", open ? "text-primary" : "text-text-secondary")}
      >
        <Avatar src={profile.avatarUrl} alt={profile.displayName} size={32} className={open ? "ring-2 ring-primary" : undefined} badge={<OwnPresenceDot avatarSize={32} />} />
        <span>{t("nav.you")}</span>
      </button>
      {open && (
        <div role="menu" aria-label={t("account.menuAriaLabel")} className={cn(PANEL_CLASS, PANEL_SIDE_CLASS)}>
          <PopoverBody actions={actions} close={close} name={profile.displayName} shortcuts={shortcuts} />
        </div>
      )}
      {actions.switchModal}
    </div>
  );
}

/** Masaüstü kenar çubuğunun en altı (lg+): ad + «Profil, ayarlar, hesap» kartı; menü yukarı açılır. Kenar çubuğunda zaten her kısayol var, menüde tekrarlanmaz. */
export function SidebarAccount() {
  const { t } = useTranslation();
  const { open, setOpen, close, rootRef, triggerRef, actions } = useAnchoredAccount();
  const { profile } = actions;
  if (!profile) return <span aria-hidden className="block h-14 w-full rounded-lg bg-surface-soft" />;
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`${profile.displayName} · ${t("account.menuAriaLabel")}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-nav-you=""
        className={cn("flex w-full items-center gap-2 rounded-lg border bg-surface px-2 py-2 text-left transition-colors duration-200 hover:bg-surface-soft", open ? "border-primary/40" : "border-border-soft")}
      >
        <Avatar src={profile.avatarUrl} alt={profile.displayName} size={32} badge={<OwnPresenceDot avatarSize={32} />} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-bold text-text">{profile.displayName}</span>
          <span className="block truncate text-caption text-text-muted">{t("nav.accountHint")}</span>
        </span>
        <ChevronUp size={16} className={cn("shrink-0 text-text-muted transition-transform duration-200", !open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" aria-label={t("account.menuAriaLabel")} className={cn(PANEL_CLASS, PANEL_UP_CLASS)}>
          <PopoverBody actions={actions} close={close} name={profile.displayName} shortcuts={[]} />
        </div>
      )}
      {actions.switchModal}
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
          <div role="menu" aria-label={t("account.guestMenuAriaLabel")} className={cn(PANEL_CLASS, "right-0 top-11 w-52 origin-top-right p-1.5")}>
            <MenuLink href="/login" icon={LogIn} label={t("header.login")} onNavigate={close} />
            <MenuLink href="/signup" icon={UserPlus} label={t("auth.signUp")} onNavigate={close} />
          </div>
        )}
      </div>
    </>
  );
}
