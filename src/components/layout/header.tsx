"use client";

import Link from "next/link";
import { Bell, LogIn, MessageCircle, Search } from "lucide-react";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { profileHref } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand-mark";

/**
 * The "Giriş Yap" link is the real auth entry point: it only shows when
 * there's genuinely no Supabase session. Signed in, the avatar links to the
 * real signed-in user's own real profile.
 */
export function Header() {
  const { user, loading } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const { conversations: realConversations } = useRealMessages();
  const { unreadCount } = useNotifications();
  const { t } = useTranslation();
  const hasUnreadMessages = realConversations.some((c) => c.unreadCount > 0);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-soft bg-background/85 px-3 backdrop-blur-md sm:px-5 lg:px-8">
      <Link
        href="/"
        aria-label={t("header.homeAriaLabel")}
        className="flex shrink-0 items-center gap-2 rounded-md md:hidden"
      >
        <BrandMark size={30} />
        <span className="font-display text-[1.05rem] font-semibold tracking-tight text-text">Promptly</span>
      </Link>

      <div className="hidden min-w-0 flex-1 items-center md:flex">
        <Link
          href="/search"
          className="group flex h-10 w-full max-w-lg items-center gap-2.5 rounded-md border border-border-soft bg-surface px-3 text-small text-text-muted shadow-xs transition-colors duration-200 hover:border-border"
        >
          <Search size={17} className="shrink-0" />
          <span className="truncate">{t("header.searchPlaceholder")}</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-end gap-0.5 md:flex-none">
        <Link
          href="/search"
          aria-label={t("header.searchAriaLabel")}
          title={t("header.searchAriaLabel")}
          className={iconButtonClassName(false, "shrink-0 md:hidden")}
        >
          <Search size={20} />
        </Link>
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
        <ThemeToggle />
        {!loading && !user && (
          <Link
            href="/login"
            className="ml-1.5 flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-text px-3 text-label font-semibold text-background transition-opacity duration-200 hover:opacity-90"
          >
            <LogIn size={16} />
            <span className="hidden sm:inline">{t("header.login")}</span>
          </Link>
        )}
        {user && ownProfile && (
          <Link href={profileHref(ownProfile)} className="ml-1.5 shrink-0 rounded-full" aria-label={ownProfile.displayName}>
            <Avatar src={ownProfile.avatarUrl} alt={ownProfile.displayName} size={36} />
          </Link>
        )}
      </div>
    </header>
  );
}
