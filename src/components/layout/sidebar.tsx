"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CreateMenuSheet } from "@/features/prompts/create-choice";
import { Plus } from "@/components/icons/plus";
import { cn } from "@/lib/utils";
import { BrandMark, BrandWordmark } from "@/components/layout/brand-mark";
import { buttonClassName } from "@/components/ui/button";
import { filterNavItems, guestLoginNavItem, isNavItemActive, navGroups, type NavItem } from "@/components/layout/nav-items";
import { SidebarAccount } from "@/components/layout/account-menu";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { SidebarTeams } from "@/components/layout/sidebar-teams";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Masaüstü (lg+): 248 px kenar çubuğu (docs/history/387-*). Sıra: marka · Oluştur · gezinme grupları (başlıksız · Çalışma · Kütüphane)
 * · en altta «Sen» kartı (profil, Ayarlar, görünüm, dil, çıkış menüde). Tablet için ayrı ince ray (`NavRail`), telefon için alt çubuk (`MobileNav`).
 */
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const status = useAuthStatus();
  const [createOpen, setCreateOpen] = useState(false);
  const { requireAuth } = useAuthPrompt();
  const isAuthenticated = status === "authenticated";
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: filterNavItems(group.items, isAuthenticated) }))
    .filter((group) => group.items.length > 0);

  function renderItem(item: NavItem) {
    const active = isNavItemActive(pathname, item);
    const Icon = item.icon;
    return (
      <li key={item.labelKey}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-body transition-colors duration-200",
            // Meydan: the active entry is a soft brand pill — no edge bar.
            active ? "bg-primary-soft font-semibold text-primary" : "font-medium text-text-secondary hover:bg-surface-soft hover:text-text",
          )}
        >
          <Icon size={20} className={active ? "text-primary" : undefined} />
          <span>{t(item.labelKey)}</span>
        </Link>
      </li>
    );
  }

  return (
    <aside data-app-chrome aria-label={t("nav.sidebarLabel")} className="sticky top-0 hidden h-dvh w-62 shrink-0 flex-col border-r border-border-soft bg-surface px-4 lg:flex">
      <div className="flex h-16 items-center px-1">
        <Link href="/" className="flex items-center gap-3 rounded-md" aria-label="Promptly">
          <BrandMark size={32} />
          <BrandWordmark className="block text-[1.55rem]" />
        </Link>
      </div>

      <div className="pb-2">
        {/* Oluştur menüsü (docs/history/216-*): ayrı seçim sayfası yerine pencere; misafire giriş diyaloğu. */}
        <button
          type="button"
          onClick={() => (status === "unauthenticated" ? requireAuth("create") : setCreateOpen(true))}
          aria-haspopup="dialog"
          data-nav-create=""
          className={buttonClassName({ className: "h-11 w-full text-body font-bold" })}
        >
          <Plus size={18} />
          {t("nav.createShort")}
        </button>
        {createOpen && <CreateMenuSheet onClose={() => setCreateOpen(false)} />}
      </div>

      <nav aria-label={t("nav.primaryLabel")} className="flex flex-1 flex-col gap-5 overflow-y-auto py-3">
        {visibleGroups.map((group, index) => (
          <div key={group.labelKey ?? `group-${index}`}>
            {group.labelKey && <p className="mb-1.5 px-3 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t(group.labelKey)}</p>}
            <ul className="space-y-0.5">{group.items.map(renderItem)}</ul>
          </div>
        ))}
        {isAuthenticated && <SidebarTeams />}
      </nav>

      <div className="border-t border-border-soft py-3">
        {isAuthenticated ? (
          <SidebarAccount />
        ) : status === "unauthenticated" ? (
          <ul>{renderItem(guestLoginNavItem)}</ul>
        ) : null}
      </div>

      {/* Ziyaretçinin «Sen» menüsü yok: Geliştiriciler + Yasal bağlantıları (docs/history/300-*) kenar çubuğunda sessiz bir satırda kalır; üyede menüdedir. */}
      {status === "unauthenticated" && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-4 text-caption text-text-muted">
          <Link href="/developers" className="rounded-sm hover:text-text hover:underline">
            {t("dev.title")}
          </Link>
          <Link href="/terms" className="rounded-sm hover:text-text hover:underline">
            {t("legal.termsTitle")}
          </Link>
          <Link href="/privacy" className="rounded-sm hover:text-text hover:underline">
            {t("legal.privacyTitle")}
          </Link>
        </div>
      )}
    </aside>
  );
}
