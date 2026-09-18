import Link from "next/link";
import { Bell, MessageCircle, Search } from "lucide-react";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur lg:px-6">
      <Link
        href="/"
        aria-label="Promptly ana sayfa"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground lg:hidden"
      >
        P
      </Link>

      <div className="flex min-w-0 flex-1 items-center">
        <Link
          href="/search"
          className="flex h-10 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-text-muted lg:max-w-md"
        >
          <Search size={18} className="shrink-0" />
          <span className="truncate">Prompt, kullanıcı veya etiket ara</span>
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href="/notifications"
          aria-label="Bildirimler"
          title="Bildirimler"
          className={iconButtonClassName(false, "shrink-0")}
        >
          <Bell size={20} />
        </Link>
        <Link
          href="/messages"
          aria-label="Mesajlar"
          title="Mesajlar"
          className={iconButtonClassName(false, "shrink-0")}
        >
          <MessageCircle size={20} />
        </Link>
        <ThemeToggle />
        <Link href="/profile/me" className="ml-1 shrink-0">
          <Avatar alt="Profilim" size={36} />
        </Link>
      </div>
    </header>
  );
}
