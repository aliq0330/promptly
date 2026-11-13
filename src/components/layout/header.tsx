"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FullLoadLink } from "@/components/ui/full-load-link";
import { Focus } from "@/components/icons/focus";
import { Languages } from "@/components/icons/languages";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Search } from "@/components/icons/search";
import { buttonClassName } from "@/components/ui/button";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { useMessageDock, useMessageDockEnabled } from "@/features/messages/message-dock-provider";
import { hasUnreadInInbox } from "@/lib/conversation-lists";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import { BrandMark, BrandWordmark } from "@/components/layout/brand-mark";
import { AccountMenu, GuestAuthMenu } from "@/components/layout/account-menu";

/**
 * Guests get "Giriş Yap" / "Kayıt Ol" (`GuestAuthMenu`); a signed-in member
 * gets the avatar dropdown (`AccountMenu`). Notifications and Messages stay
 * here in the top bar, never in the account menu.
 */
export function Header() {
  const status = useAuthStatus();
  const { conversations: realConversations } = useRealMessages();
  const { t, language, setLanguage } = useTranslation();
  const hasUnreadMessages = hasUnreadInInbox(realConversations);
  // Büyük ekranda mesaj simgesi sayfaya gitmez, sağ alttaki Mesajlar panelini açar/kapatır (docs/history/328-*); dar ekranda ve /messages'ta eskisi gibi bağlantıdır.
  const dock = useMessageDock();
  const dockEnabled = useMessageDockEnabled();
  // Discover and Search carry their own (richer) search box — a second one in the header would just be a link back to the same page.
  const pathname = usePathname() ?? "";
  const hasOwnSearch = /^\/(discover|search)(\/|$)/.test(pathname);
  // Açık sohbette telefonda üst menü yok: sohbet paneli ekranın üstüne kadar uzanır (alt menüyle aynı kural, docs/history/194-*).
  const inChat = pathname.startsWith("/messages/local");

  return (
    <header data-app-chrome data-app-header className={cn("sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-soft bg-surface/90 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-5 lg:px-8", inChat && "max-md:hidden")}>
      <Link
        href="/"
        aria-label={t("header.homeAriaLabel")}
        className="flex shrink-0 items-center gap-2 rounded-md md:hidden"
      >
        <BrandMark size={30} />
        <BrandWordmark className="text-[1.4rem] max-[359px]:hidden" />
      </Link>

      <div className="hidden min-w-0 flex-1 items-center md:flex">
        {!hasOwnSearch && (
        <Link
          href="/discover"
          className="group flex h-10 w-full max-w-lg items-center gap-3 rounded-full border border-border-soft bg-surface px-4 text-small text-text-muted shadow-xs transition-[border-color,box-shadow,color] duration-200 hover:border-border hover:text-text-secondary hover:shadow-sm"
        >
          <Search size={16} className="shrink-0" />
          <span className="truncate">{t("header.searchPlaceholder")}</span>
        </Link>
        )}
      </div>

      <div className="flex flex-1 items-center justify-end gap-0.5 md:flex-none">
        {!hasOwnSearch && (
        <Link
          href="/discover"
          aria-label={t("header.searchAriaLabel")}
          title={t("header.searchAriaLabel")}
          className={iconButtonClassName(false, "shrink-0 md:hidden")}
        >
          <Search size={20} />
        </Link>
        )}
        {/* Odak (docs/history/227-*): from `md` it is a header button — a vertical full-screen feed is not a sidebar destination; on a phone it keeps its bottom-nav slot. A full page load, not a client-side swap (docs/history/249-*). */}
        <FullLoadLink href="/focus" className={buttonClassName({ variant: "outline", size: "sm", className: "mr-1 hidden shrink-0 gap-1.5 md:inline-flex" })}>
          <Focus size={16} aria-hidden />
          {t("header.focusLink")}
        </FullLoadLink>
        {status === "authenticated" && (
          <>
            <NotificationBell />
            {dockEnabled ? (
              <button
                type="button"
                onClick={dock.toggle}
                aria-label={t("header.messagesAriaLabel")}
                aria-expanded={dock.open}
                title={t("header.messagesAriaLabel")}
                data-header-messages=""
                className={iconButtonClassName(dock.open, "shrink-0 relative")}
              >
                <MessagesSquare size={20} />
                {hasUnreadMessages && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />}
              </button>
            ) : (
              <Link
                href="/messages"
                aria-label={t("header.messagesAriaLabel")}
                title={t("header.messagesAriaLabel")}
                data-header-messages=""
                className={iconButtonClassName(false, "shrink-0 relative")}
              >
                <MessagesSquare size={20} />
                {hasUnreadMessages && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                )}
              </Link>
            )}
          </>
        )}
        {/* Members change the theme from the account menu; guests (no menu) keep the quick toggle here. */}
        {status === "unauthenticated" && <ThemeToggle />}
        {status === "unauthenticated" && (
          <>
            {/* Guests can't reach /settings, so the language switch lives here for them. */}
            <IconButton
              label={t("header.switchLanguage")}
              onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
              className="shrink-0"
            >
              <Languages size={20} />
            </IconButton>
            <GuestAuthMenu />
          </>
        )}
        {/* While the session is still resolving, hold the avatar's space so nothing shifts. */}
        {status === "loading" && <span aria-hidden className="ml-1.5 h-9 w-9 shrink-0" />}
        {status === "authenticated" && <AccountMenu />}
      </div>
    </header>
  );
}
