"use client";

import Link from "next/link";
import { Bell, Languages, MessageCircle, Search } from "lucide-react";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { IconButton } from "@/components/ui/icon-button";
import { BrandMark } from "@/components/layout/brand-mark";
import { AccountMenu, GuestAuthMenu } from "@/components/layout/account-menu";

/**
 * Guests get "Giriş Yap" / "Kayıt Ol" (`GuestAuthMenu`); a signed-in member
 * gets the avatar dropdown (`AccountMenu`). Notifications and Messages stay
 * here in the top bar, never in the account menu.
 */
export function Header() {
  const status = useAuthStatus();
  const { conversations: realConversations } = useRealMessages();
  const { unreadCount } = useNotifications();
  const { t, language, setLanguage } = useTranslation();
  const hasUnreadMessages = realConversations.some((c) => c.unreadCount > 0);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-soft bg-background/80 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-5 lg:px-8">
      <Link
        href="/"
        aria-label={t("header.homeAriaLabel")}
        className="flex shrink-0 items-center gap-2 rounded-md md:hidden"
      >
        <BrandMark size={30} />
        <span className="font-serif text-[1.2rem] font-semibold tracking-[-0.02em] text-text max-[359px]:hidden">Promptly</span>
      </Link>

      <div className="hidden min-w-0 flex-1 items-center md:flex">
        <Link
          href="/discover"
          className="group flex h-10 w-full max-w-lg items-center gap-2.5 rounded-full border border-border-soft bg-surface px-4 text-small text-text-muted shadow-xs transition-[border-color,box-shadow,color] duration-200 hover:border-border hover:text-text-secondary hover:shadow-sm"
        >
          <Search size={17} className="shrink-0" />
          <span className="truncate">{t("header.searchPlaceholder")}</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-end gap-0.5 md:flex-none">
        <Link
          href="/discover"
          aria-label={t("header.searchAriaLabel")}
          title={t("header.searchAriaLabel")}
          className={iconButtonClassName(false, "shrink-0 md:hidden")}
        >
          <Search size={20} />
        </Link>
        {status === "authenticated" && (
          <>
            <Link
              href="/notifications"
              aria-label={t("header.notificationsAriaLabel")}
              title={t("header.notificationsAriaLabel")}
              className={iconButtonClassName(false, "shrink-0 relative")}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </Link>
            <Link
              href="/messages"
              aria-label={t("header.messagesAriaLabel")}
              title={t("header.messagesAriaLabel")}
              className={iconButtonClassName(false, "shrink-0 relative")}
            >
              <MessageCircle size={20} />
              {hasUnreadMessages && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </Link>
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
