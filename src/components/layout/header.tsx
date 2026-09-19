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
import { profileHref } from "@/lib/utils";

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
  const hasUnreadMessages = realConversations.some((c) => c.unreadCount > 0);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur lg:px-6">
      <Link
        href="/"
        aria-label="Promptly ana sayfa"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground lg:hidden"
      >
        P
      </Link>

      <div className="hidden min-w-0 flex-1 items-center lg:flex">
        <Link
          href="/search"
          className="flex h-10 w-full max-w-md items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-text-muted"
        >
          <Search size={18} className="shrink-0" />
          <span className="truncate">Prompt, kullanıcı veya etiket ara</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-end gap-1 lg:flex-none">
        <Link
          href="/search"
          aria-label="Ara"
          title="Ara"
          className={iconButtonClassName(false, "shrink-0 lg:hidden")}
        >
          <Search size={20} />
        </Link>
        <Link
          href="/notifications"
          aria-label="Bildirimler"
          title="Bildirimler"
          className={iconButtonClassName(false, "shrink-0 relative")}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
          )}
        </Link>
        <Link
          href="/messages"
          aria-label="Mesajlar"
          title="Mesajlar"
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
            className="ml-1 flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
          >
            <LogIn size={16} />
            <span className="hidden sm:inline">Giriş Yap</span>
          </Link>
        )}
        {user && ownProfile && (
          <Link href={profileHref(ownProfile)} className="ml-1 shrink-0">
            <Avatar src={ownProfile.avatarUrl} alt={ownProfile.displayName} size={36} />
          </Link>
        )}
      </div>
    </header>
  );
}
