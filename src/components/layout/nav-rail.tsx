"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CreateMenuSheet } from "@/features/prompts/create-choice";
import { Plus } from "@/components/icons/plus";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand-mark";
import { filterNavItems, guestLoginNavItem, isNavItemActive, navGroups, type NavItem } from "@/components/layout/nav-items";
import { RailAccount } from "@/components/layout/account-menu";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Tablet (md–lg): 84 px ince ray (docs/history/387-*). Kenar çubuğunun aynı hedefleri, ikonun altında 12 px etiketle; yalnız `rail` işaretli
 * girişler gelir (Ana Sayfa · Keşfet · Topluluklar │ Spaces · Ekipler · Kaydedilen), kalanlar (Takip, Panel, Studio) «Sen» menüsünde kısayoldur.
 * Üstte marka + tek mavi «Oluştur», en altta «Sen».
 */
export function NavRail() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const status = useAuthStatus();
  const [createOpen, setCreateOpen] = useState(false);
  const { requireAuth } = useAuthPrompt();
  const isAuthenticated = status === "authenticated";
  const sections = navGroups
    .map((group) => filterNavItems(group.items, isAuthenticated).filter((item) => item.rail))
    .filter((items) => items.length > 0);

  function renderItem(item: NavItem) {
    const active = isNavItemActive(pathname, item);
    const Icon = item.icon;
    return (
      <li key={item.labelKey}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-15 w-full flex-col items-center justify-center gap-1 rounded-lg text-caption transition-colors duration-200",
            active ? "bg-primary-soft font-semibold text-primary" : "font-medium text-text-secondary hover:bg-surface-soft hover:text-text",
          )}
        >
          <Icon size={24} />
          <span className="max-w-full truncate">{t(item.railLabelKey ?? item.labelKey)}</span>
        </Link>
      </li>
    );
  }

  return (
    <aside data-app-chrome aria-label={t("nav.sidebarLabel")} className="sticky top-0 z-(--z-nav) hidden h-dvh w-21 shrink-0 flex-col items-center border-r border-border-soft bg-surface px-1.5 pb-4 md:flex lg:hidden">
      <div className="flex h-16 items-center justify-center">
        <Link href="/" className="rounded-md" aria-label="Promptly">
          <BrandMark size={34} />
        </Link>
      </div>

      <button
        type="button"
        onClick={() => (status === "unauthenticated" ? requireAuth("create") : setCreateOpen(true))}
        aria-haspopup="dialog"
        aria-label={t("nav.createShort")}
        title={t("nav.createShort")}
        data-nav-create=""
        className="mb-4 flex h-13 w-13 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-95"
      >
        <Plus size={24} />
      </button>
      {createOpen && <CreateMenuSheet onClose={() => setCreateOpen(false)} />}

      <nav aria-label={t("nav.primaryLabel")} className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto">
        {sections.map((items, index) => (
          <div key={index} className="w-full">
            {index > 0 && <span aria-hidden className="mx-auto my-2 block h-px w-8 bg-border-soft" />}
            <ul className="space-y-1">{items.map(renderItem)}</ul>
          </div>
        ))}
      </nav>

      {isAuthenticated ? <RailAccount /> : status === "unauthenticated" ? <ul className="mt-auto w-full">{renderItem(guestLoginNavItem)}</ul> : null}
    </aside>
  );
}
