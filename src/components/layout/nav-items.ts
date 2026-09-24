import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  Bookmark,
  Compass,
  Hash,
  Home,
  PlusSquare,
  Settings,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

/** Full primary navigation, used by the desktop sidebar. */
export const primaryNavItems: NavItem[] = [
  { href: "/", labelKey: "nav.home", icon: Home },
  { href: "/discover", labelKey: "nav.discover", icon: Compass },
  { href: "/create", labelKey: "nav.createPrompt", icon: PlusSquare },
  { href: "/generators", labelKey: "nav.generators", icon: Blocks },
  { href: "/requests", labelKey: "nav.requests", icon: Sparkles },
  { href: "/tags", labelKey: "nav.tags", icon: Hash },
  { href: "/saved", labelKey: "nav.saved", icon: Bookmark },
  { href: "/following", labelKey: "nav.following", icon: Users },
  { href: "/profile/me", labelKey: "nav.profile", icon: User },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

/** Reduced set shown in the mobile bottom navigation. */
export const mobileNavItems: NavItem[] = [
  { href: "/", labelKey: "nav.home", icon: Home },
  { href: "/discover", labelKey: "nav.discover", icon: Compass },
  { href: "/create", labelKey: "nav.createShort", icon: PlusSquare },
  { href: "/requests", labelKey: "nav.requestsShort", icon: Sparkles },
  { href: "/profile/me", labelKey: "nav.profile", icon: User },
];
