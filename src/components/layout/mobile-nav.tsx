"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import { CreateMenuSheet } from "@/features/prompts/create-choice";
import { CommunityIcon, CompassIcon, HomeIcon, PlusIcon, type MotionIconProps } from "@/components/ui/motion-icons";
import { cn } from "@/lib/utils";
import { CREATE_HREF, guestLoginNavItem, isNavItemActive, mobileNavItems, YOU_HREF, type NavItem } from "@/components/layout/nav-items";
import { PhoneAccountTab } from "@/components/layout/account-menu";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Her sekmenin kendi hareketli ikonu (docs/history/335-*): sekme AKTİF olunca bir kez oynar; sayfa açılışında oynamaz. Listede olmayan (giriş) kalıp sitenin ikon setinden (`@/components/icons`) gelir. */
const MOTION_ICONS: Record<string, ComponentType<MotionIconProps>> = {
  "/": HomeIcon,
  "/discover": CompassIcon,
  "/communities": CommunityIcon,
};

/**
 * Mobile-only bottom navigation (docs/history/387-*): Ana Sayfa · Keşfet · Oluştur (vurgulu, ortada) · Topluluklar · Sen. «Sen» avatar +
 * etiket; basınca alttan «Sen» sayfası açılır (`PhoneAccountTab`). Odak üst çubuğa taşındı.
 * Hidden inside an open chat (`/messages/local`, a conversation or a new-chat draft): the chat panel then runs to the
 * screen's bottom edge and the composer sits there, like other messengers (docs/history/193-*).
 */
export function MobileNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const status = useAuthStatus();
  const { requireAuth } = useAuthPrompt();
  const inChat = pathname.startsWith("/messages/local");
  // "+" = Oluştur menüsü (docs/history/216-*): ayrı seçim sayfası yerine alttan açılan pencere.
  const [createOpen, setCreateOpen] = useState(false);

  // Always five slots, so nothing reflows between states. «Sen» is member-only: guests get "Giriş Yap" in that slot, and the slot stays empty while the session resolves.
  const items: (NavItem | null)[] = mobileNavItems.map((item) => {
    if ((item.visibility ?? "public") === "public" || status === "authenticated") return item;
    return status === "unauthenticated" ? guestLoginNavItem : null;
  });

  // Üstteki aktif çizgi tek bir öğedir ve sekmeler arasında kayar; "+" sayfa olmadığı için yuvasını atlar (docs/history/335-*).
  const activeIndex = items.findIndex((item) => item !== null && item.href !== CREATE_HREF && isNavItemActive(pathname, item));
  const activeHref = activeIndex >= 0 ? items[activeIndex]!.href : null;
  // Sekme aktif OLDUĞUNDA ikonu bir kez oynat: render sırasında önceki değerle karşılaştırılır (ilk boyamada oynamaz).
  const [prevActive, setPrevActive] = useState(activeHref);
  const [iconSeq, setIconSeq] = useState<Record<string, number>>({});
  if (prevActive !== activeHref) {
    setPrevActive(activeHref);
    if (activeHref) setIconSeq((seqs) => ({ ...seqs, [activeHref]: (seqs[activeHref] ?? 0) + 1 }));
  }

  if (inChat) return null;

  return (
    <>
    <nav
      data-app-chrome
      data-app-nav
      aria-label={t("nav.primaryLabel")}
      // Opaque, and its colour continues below the screen edge (`after:`): the strip the browser's own toolbar floats over
      // (iOS Safari) shows this colour instead of the page background, like Instagram's — docs/history/193-*.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-surface pb-[env(safe-area-inset-bottom)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-[50dvh] after:bg-surface md:hidden"
    >
      <span
        aria-hidden
        data-nav-indicator
        className="pointer-events-none absolute left-0 top-0 flex h-[3px] w-1/5 justify-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.3,1.55,0.5,1)]"
        style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex >= 0 ? 1 : 0 }}
      >
        <span className="h-[3px] w-6 rounded-b-full bg-primary" />
      </span>
      <ul className="flex h-16 items-stretch">
        {items.map((item, index) => {
          if (!item) return <li key={`slot-${index}`} aria-hidden className="flex flex-1" />;
          const href = item.href;
          const active = isNavItemActive(pathname, item);
          const Icon = item.icon;
          const MotionIcon = MOTION_ICONS[item.href];
          const label = t(item.labelKey);
          const isCreate = item.href === CREATE_HREF;
          const itemClassName = cn(
            "relative flex flex-1 flex-col items-center justify-center gap-1 text-micro font-medium transition-colors",
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
                <PlusIcon open={createOpen} size={20} strokeWidth={2.4} />
              </span>
            ) : (
              <>
                {MotionIcon ? (
                  <MotionIcon size={22} strokeWidth={active ? 2.2 : 1.8} seq={iconSeq[item.href]} className={active ? "text-primary" : undefined} />
                ) : (
                  <Icon size={24} className={active ? "text-primary" : undefined} />
                )}
              </>
            )}
            <span className={isCreate ? "sr-only" : undefined}>{label}</span>
            </>
          );
          return (
            <li key={item.labelKey} className="flex flex-1">
              {isCreate ? (
                <button
                  type="button"
                  onClick={() => (status === "unauthenticated" ? requireAuth("create") : setCreateOpen(true))}
                  aria-haspopup="dialog"
                  data-nav-create=""
                  className={itemClassName}
                >
                  {inner}
                </button>
              ) : item.href === YOU_HREF ? (
                <PhoneAccountTab active={active} className={itemClassName} />
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
    {createOpen && <CreateMenuSheet onClose={() => setCreateOpen(false)} />}
    </>
  );
}
