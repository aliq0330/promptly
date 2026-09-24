import type { LucideIcon } from "lucide-react";
import { Blocks, Bookmark, Compass, Hash, Home, Plus, Settings, Sparkles, User, Users } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  /**
   * Path prefix that marks this item active. Defaults to `href`. The
   * profile entry's href is a placeholder resolved at render time (own
   * profile or /login), so it matches on "/profile" instead — this is what
   * finally highlights "Profil" while viewing your own real profile.
   */
  match?: string;
}

export interface NavGroup {
  labelKey: TranslationKey;
  items: NavItem[];
}

export const PROFILE_NAV_PLACEHOLDER = "/profile/me";

/** Desktop/tablet sidebar. "Oluştur" is a separate primary action above these groups. */
export const navGroups: NavGroup[] = [
  {
    labelKey: "nav.groupDiscover",
    items: [
      { href: "/", labelKey: "nav.home", icon: Home },
      { href: "/discover", labelKey: "nav.discover", icon: Compass },
      { href: "/generators", labelKey: "nav.generators", icon: Blocks },
      { href: "/requests", labelKey: "nav.requests", icon: Sparkles },
      { href: "/tags", labelKey: "nav.tags", icon: Hash },
    ],
  },
  {
    labelKey: "nav.groupLibrary",
    items: [
      { href: "/saved", labelKey: "nav.saved", icon: Bookmark, match: "/saved" },
      { href: "/following", labelKey: "nav.following", icon: Users },
      { href: PROFILE_NAV_PLACEHOLDER, labelKey: "nav.profile", icon: User, match: "/profile" },
    ],
  },
];

export const settingsNavItem: NavItem = { href: "/settings", labelKey: "nav.settings", icon: Settings };

/** Mobile bottom navigation — the middle item is rendered as the emphasized Create action. */
export const mobileNavItems: NavItem[] = [
  { href: "/", labelKey: "nav.home", icon: Home },
  { href: "/discover", labelKey: "nav.discover", icon: Compass },
  { href: "/create", labelKey: "nav.createShort", icon: Plus },
  { href: "/requests", labelKey: "nav.requestsShort", icon: Sparkles },
  { href: PROFILE_NAV_PLACEHOLDER, labelKey: "nav.profile", icon: User, match: "/profile" },
];

export function isNavItemActive(pathname: string, item: NavItem) {
  const prefix = item.match ?? item.href;
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix);
}
