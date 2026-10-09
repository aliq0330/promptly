import type { LucideIcon } from "lucide-react";
import { Blocks, Bookmark, Compass, Hash, Home, LogIn, Plus, Settings, SlidersHorizontal, Sparkles, SquareTerminal, User, Users, WandSparkles, Workflow } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";

/** Who may see a nav entry: everyone, or only a signed-in member. */
export type NavVisibility = "public" | "authenticated";

export interface NavItem {
  href: string;
  /** Defaults to "public". "authenticated" entries are never rendered for guests (nor while the session is still resolving). */
  visibility?: NavVisibility;
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
      { href: "/prompts", labelKey: "nav.prompts", icon: SquareTerminal },
      { href: "/generators", labelKey: "nav.generators", icon: Blocks },
      { href: "/workflows", labelKey: "nav.workflows", icon: Workflow },
      { href: "/presets", labelKey: "nav.presets", icon: SlidersHorizontal },
      { href: "/generate", labelKey: "nav.generate", icon: WandSparkles },
      { href: "/requests", labelKey: "nav.requests", icon: Sparkles },
      { href: "/tags", labelKey: "nav.tags", icon: Hash },
    ],
  },
  {
    labelKey: "nav.groupLibrary",
    items: [
      { href: "/saved", labelKey: "nav.saved", icon: Bookmark, match: "/saved", visibility: "authenticated" },
      { href: "/following", labelKey: "nav.following", icon: Users, visibility: "authenticated" },
      { href: PROFILE_NAV_PLACEHOLDER, labelKey: "nav.profile", icon: User, match: "/profile", visibility: "authenticated" },
    ],
  },
];

export const settingsNavItem: NavItem = { href: "/settings", labelKey: "nav.settings", icon: Settings, visibility: "authenticated" };

/** Shown to guests where a member sees their profile entry. */
export const guestLoginNavItem: NavItem = { href: "/login", labelKey: "header.login", icon: LogIn };

/** The Create action — for guests it opens the login dialog instead of navigating. */
export const CREATE_HREF = "/create";

/** Mobile bottom navigation — the middle item is rendered as the emphasized Create action. */
export const mobileNavItems: NavItem[] = [
  { href: "/", labelKey: "nav.home", icon: Home },
  { href: "/discover", labelKey: "nav.discover", icon: Compass },
  { href: CREATE_HREF, labelKey: "nav.createShort", icon: Plus },
  { href: "/requests", labelKey: "nav.requestsShort", icon: Sparkles },
  { href: PROFILE_NAV_PLACEHOLDER, labelKey: "nav.profile", icon: User, match: "/profile", visibility: "authenticated" },
];

export function isNavItemActive(pathname: string, item: NavItem) {
  const prefix = item.match ?? item.href;
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix);
}

/** Central visibility filter: guests (and the loading state) only ever get public entries. */
export function filterNavItems(items: NavItem[], isAuthenticated: boolean): NavItem[] {
  return items.filter((item) => (item.visibility ?? "public") === "public" || isAuthenticated);
}
