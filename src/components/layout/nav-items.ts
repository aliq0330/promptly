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

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Full primary navigation, used by the desktop sidebar. */
export const primaryNavItems: NavItem[] = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/discover", label: "Keşfet", icon: Compass },
  { href: "/create", label: "Prompt Oluştur", icon: PlusSquare },
  { href: "/generators", label: "Generatorlar", icon: Blocks },
  { href: "/requests", label: "Prompt İstekleri", icon: Sparkles },
  { href: "/tags", label: "Etiketler", icon: Hash },
  { href: "/saved", label: "Kaydedilenler", icon: Bookmark },
  { href: "/following", label: "Takip Ettiklerim", icon: Users },
  { href: "/profile/me", label: "Profil", icon: User },
  { href: "/settings", label: "Ayarlar", icon: Settings },
];

/** Reduced set shown in the mobile bottom navigation. */
export const mobileNavItems: NavItem[] = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/discover", label: "Keşfet", icon: Compass },
  { href: "/create", label: "Oluştur", icon: PlusSquare },
  { href: "/requests", label: "İstekler", icon: Sparkles },
  { href: "/profile/me", label: "Profil", icon: User },
];
