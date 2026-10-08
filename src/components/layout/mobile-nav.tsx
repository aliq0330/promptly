"use client";

import { useEffect, useState } from "react";
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

  // Scrolling down shrinks/dims the bar; scrolling up, hovering, touching or
  // focusing inside it brings it back to full size.
  const [scrolledDown, setScrolledDown] = useState(false);
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (y < 24) setScrolledDown(false);
      else if (delta > 6) setScrolledDown(true);
      else if (delta < -6) setScrolledDown(false);
      if (Math.abs(delta) > 6) lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const compact = scrolledDown && !engaged;

  return (
    <nav
      aria-label={t("nav.primaryLabel")}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:hidden"
    >
      <ul
        onPointerEnter={() => setEngaged(true)}
        onPointerLeave={() => setEngaged(false)}
        onPointerDown={() => setEngaged(true)}
        onPointerUp={() => setEngaged(false)}
        onPointerCancel={() => setEngaged(false)}
        onFocus={() => setEngaged(true)}
        onBlur={() => setEngaged(false)}
        className={cn(
          "pointer-events-auto flex items-stretch rounded-[1.75rem] border border-border-soft bg-surface-elevated shadow-pop backdrop-blur-xl backdrop-saturate-150 transition-[width,height,opacity] duration-300 ease-soft motion-reduce:transition-none",
          compact ? "h-14 w-[82%] opacity-70" : "h-16 w-full opacity-100",
        )}
      >
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
