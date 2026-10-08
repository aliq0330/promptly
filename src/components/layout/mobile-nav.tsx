"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CREATE_HREF, guestLoginNavItem, isNavItemActive, mobileNavItems, PROFILE_NAV_PLACEHOLDER, type NavItem } from "@/components/layout/nav-items";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useProfileNavHref } from "@/features/auth/use-profile-nav-href";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Mobile-only bottom navigation; the middle "Oluştur" action is visually emphasized. */
export function MobileNav() {
  const pathname = usePathname();
  const profileNavHref = useProfileNavHref();
  const { t } = useTranslation();
  const status = useAuthStatus();
  const { requireAuth } = useAuthPrompt();

  // Always five slots, so nothing reflows between states: members get their
  // profile, guests get "Giriş Yap" in that slot, and while the session is
  // still resolving the slot stays an empty placeholder (neither is shown).
  const items: (NavItem | null)[] = mobileNavItems.map((item) => {
    if ((item.visibility ?? "public") === "public" || status === "authenticated") return item;
    return status === "unauthenticated" ? guestLoginNavItem : null;
  });

  return (
    <nav
      aria-label={t("nav.primaryLabel")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="flex h-16 items-stretch">
        {items.map((item, index) => {
          if (!item) return <li key={`slot-${index}`} aria-hidden className="flex flex-1" />;
          const href = item.href === PROFILE_NAV_PLACEHOLDER ? profileNavHref : item.href;
          const active = isNavItemActive(pathname, item);
          const Icon = item.icon;
          const label = t(item.labelKey);
          const isCreate = item.href === CREATE_HREF;
          const itemClassName = cn(
            "relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
            active ? "text-text" : "text-text-muted",
          );
          const inner = (
            <>
            {isCreate ? (
              <span
                className={cn(
                  "flex h-10 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_6px_14px_-6px_rgb(var(--p-shadow)/calc(0.5*var(--p-sa)))] transition-transform active:scale-95",
                  active && "ring-2 ring-primary/30 ring-offset-2 ring-offset-surface",
                )}
              >
                <Icon size={20} strokeWidth={2.4} />
              </span>
            ) : (
              <>
                {active && <span aria-hidden className="absolute top-0 h-[3px] w-6 rounded-b-full bg-primary" />}
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-primary" : undefined} />
              </>
            )}
            <span className={isCreate ? "sr-only" : undefined}>{label}</span>
            </>
          );
          return (
            <li key={item.labelKey} className="flex flex-1">
              {isCreate && status === "unauthenticated" ? (
                <button type="button" onClick={() => requireAuth("create")} aria-haspopup="dialog" className={itemClassName}>
                  {inner}
                </button>
              ) : (
                <Link href={href} aria-current={active ? "page" : undefined} className={itemClassName}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
