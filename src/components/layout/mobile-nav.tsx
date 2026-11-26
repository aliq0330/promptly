"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, type ComponentType } from "react";
import { CreateMenuSheet } from "@/features/prompts/create-choice";
import { BellIcon, CompassIcon, FocusIcon, HomeIcon, PlusIcon, type MotionIconProps } from "@/components/ui/motion-icons";
import { CountBadge } from "@/components/ui/badge";
import { FullLoadLink } from "@/components/ui/full-load-link";
import { cn } from "@/lib/utils";
import { FOCUS_HREF, isNavItemActive, MESSAGES_HREF, mobileNavItems, NOTIFICATIONS_HREF } from "@/components/layout/nav-items";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useAuthPrompt, type AuthPromptReason } from "@/features/auth/auth-prompt-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { hasUnreadInInbox } from "@/lib/conversation-lists";
import { showsCreateHub } from "@/lib/phone-chrome";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Her sekmenin kendi hareketli ikonu (docs/history/335-*): sekme AKTİF olunca bir kez oynar; sayfa açılışında oynamaz. Listede olmayan (Mesajlar) kalıp sitenin ikon setinden (`@/components/icons`) gelir. */
const MOTION_ICONS: Record<string, ComponentType<MotionIconProps>> = {
  "/": HomeIcon,
  [FOCUS_HREF]: FocusIcon,
  [NOTIFICATIONS_HREF]: BellIcon,
  "/discover": CompassIcon,
};

/** Misafir bu yuvalara dokunursa açılan giriş penceresinin nedeni. */
const GUEST_REASONS: Record<string, AuthPromptReason> = { [MESSAGES_HREF]: "message", [NOTIFICATIONS_HREF]: "generic" };

/**
 * Sağ alttaki mavi «+» — Oluştur hub'ı (docs/history/462-*; yalnız telefon). Yalnız Ana Sayfa, Keşfet ve KENDİ profilinde görünür (`showsCreateHub`);
 * profilin kimin olduğu `?username=` adres parametresindedir, bu yüzden `useSearchParams` için Suspense içinde durur. Klavye açıkken gizlenir (`data-keyboard-hide`).
 */
function CreateHub({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const { profile } = useOwnProfile();
  if (!showsCreateHub(pathname, params.get("username"), profile?.username ?? null)) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={t("nav.createShort")}
      data-app-chrome
      data-keyboard-hide
      data-create-hub=""
      className="fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-(--z-nav) flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md transition-transform active:scale-95 md:hidden"
    >
      <PlusIcon open={open} size={24} />
    </button>
  );
}

/**
 * Mobile-only bottom navigation (docs/history/462-*): Ana Sayfa · Odak · Mesajlar · Bildirimler · Keşfet. «Sen» üst çubuğun sağındaki avatardır,
 * Oluştur sağ alttaki mavi «+» hub'ıdır (`CreateHub`). Mesajlar ve Bildirimler misafire de görünür: dokununca giriş penceresi açılır, yuvalar yer değiştirmez.
 * Odak tam sayfa yüklemesiyle açılır (`FullLoadLink`, docs/history/249-*).
 * Hidden inside an open chat (`/messages/local`, a conversation or a new-chat draft): the chat panel then runs to the
 * screen's bottom edge and the composer sits there, like other messengers (docs/history/193-*).
 */
export function MobileNav() {
  const pathname = usePathname() ?? "";
  const { t } = useTranslation();
  const status = useAuthStatus();
  const { requireAuth } = useAuthPrompt();
  const { conversations } = useRealMessages();
  const { unreadCount } = useNotifications();
  const hasUnreadMessages = hasUnreadInInbox(conversations);
  const inChat = pathname.startsWith("/messages/local");
  // "+" = Oluştur menüsü (docs/history/216-*): ayrı seçim sayfası yerine alttan açılan pencere.
  const [createOpen, setCreateOpen] = useState(false);

  // Üstteki aktif çizgi tek bir öğedir ve sekmeler arasında kayar (docs/history/335-*). Odak çubuksuz kendi sayfasıdır: orada hiçbir yuva yanmaz.
  const activeIndex = mobileNavItems.findIndex((item) => isNavItemActive(pathname, item));
  const activeHref = activeIndex >= 0 ? mobileNavItems[activeIndex]!.href : null;
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
        className="pointer-events-none absolute left-0 top-0 flex h-[3px] w-1/5 justify-center transition-[transform,opacity] duration-300 ease-soft"
        style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex >= 0 ? 1 : 0 }}
      >
        <span className="h-[3px] w-6 rounded-b-full bg-primary" />
      </span>
      <ul className="flex h-16 items-stretch">
        {mobileNavItems.map((item) => {
          const href = item.href;
          const active = activeHref === href;
          const Icon = item.icon;
          const MotionIcon = MOTION_ICONS[href];
          const label = t(item.labelKey);
          const itemClassName = cn(
            "relative flex flex-1 flex-col items-center justify-center gap-1 text-caption font-medium transition-colors",
            active ? "text-primary-text" : "text-text-muted",
          );
          const inner = (
            <>
              {MotionIcon ? <MotionIcon size={24} seq={iconSeq[href]} /> : <Icon size={24} />}
              <span className="max-w-full truncate px-0.5">{label}</span>
              {href === MESSAGES_HREF && hasUnreadMessages && <span aria-hidden data-nav-dot="" className="absolute left-[calc(50%+0.5rem)] top-2 h-2 w-2 rounded-full bg-primary" />}
              {href === NOTIFICATIONS_HREF && unreadCount > 0 && (
                <CountBadge aria-hidden data-nav-badge="" className="absolute left-[calc(50%+0.25rem)] top-1 border-2 border-surface">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </CountBadge>
              )}
            </>
          );
          const needsLogin = (item.visibility ?? "public") === "authenticated" && status === "unauthenticated";
          return (
            <li key={item.labelKey} className="flex flex-1">
              {needsLogin ? (
                <button type="button" onClick={() => requireAuth(GUEST_REASONS[href] ?? "generic")} aria-haspopup="dialog" className={itemClassName}>
                  {inner}
                </button>
              ) : href === FOCUS_HREF ? (
                <FullLoadLink href={href} className={itemClassName}>
                  {inner}
                </FullLoadLink>
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
    <Suspense fallback={null}>
      <CreateHub open={createOpen} onOpen={() => (status === "unauthenticated" ? requireAuth("create") : setCreateOpen(true))} />
    </Suspense>
    {createOpen && <CreateMenuSheet onClose={() => setCreateOpen(false)} />}
    </>
  );
}
