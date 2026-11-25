import type { IconComponent } from "@/components/icons/icon";
import { BarChart3 } from "@/components/icons/bar-chart-3";
import { Briefcase } from "@/components/icons/briefcase";
import { Bell } from "@/components/icons/bell";
import { Bookmark } from "@/components/icons/bookmark";
import { Compass } from "@/components/icons/compass";
import { Focus } from "@/components/icons/focus";
import { Home } from "@/components/icons/home";
import { LogIn } from "@/components/icons/log-in";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Shapes } from "@/components/icons/shapes";
import { Users } from "@/components/icons/users";
import { UsersRound } from "@/components/icons/users-round";
import { WandSparkles } from "@/components/icons/wand-sparkles";
import type { TranslationKey } from "@/lib/i18n/translations";

/** Who may see a nav entry: everyone, or only a signed-in member. */
export type NavVisibility = "public" | "authenticated";

export interface NavItem {
  href: string;
  /** Defaults to "public". "authenticated" entries are never rendered for guests (nor while the session is still resolving). */
  visibility?: NavVisibility;
  labelKey: TranslationKey;
  icon: IconComponent;
  /**
   * Path prefix that marks this item active. Defaults to `href`. The «Sen» entry has no page of its own (`YOU_HREF`), so it
   * matches on "/profile" instead.
   */
  match?: string;
  /** Further path prefixes that keep this entry lit (Keşfet: the content list / topic pages that are one of its sections now, docs/history/227-*). */
  alsoMatch?: string[];
  /** Tablet rayında (md–lg) görünür; rayda OLMAYAN kısayollar «Sen» menüsünde listelenir (docs/history/387-*). */
  rail?: boolean;
  /** Rayda ikonun altındaki kısa etiket (72 px'e sığmayan adlar için). */
  railLabelKey?: TranslationKey;
  /** «Sen» sayfasındaki kısayol kutusunda kısa etiket (kutuya sığmayan adlar için). */
  tileLabelKey?: TranslationKey;
}

export interface NavGroup {
  /** Yok = başlıksız ilk grup. */
  labelKey?: TranslationKey;
  items: NavItem[];
}

/**
 * Gezinme (docs/history/387-*): kenar çubuğu (lg+), ince ray (md) ve alt çubuk (telefon) AYNI hedeflerin üç görünümüdür; bir hedef
 * boyuta göre yer değiştirmez, yalnız etiket/liste kısalır. Üst çubuk gezinme DEĞİL durumdur (arama, Odak, bildirim, mesaj).
 * "Oluştur" gruplardan ayrı tek birincil eylemdir. Profil/Ayarlar/tema/dil/çıkış «Sen» menüsündedir (`account-menu.tsx`), burada değil.
 */
export const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/", labelKey: "nav.home", icon: Home, rail: true },
      { href: "/discover", labelKey: "nav.discover", icon: Compass, rail: true, alsoMatch: ["/prompts", "/requests", "/workflows", "/presets", "/skills", "/tags", "/categories", "/tools", "/results", "/quotes"] },
      { href: "/communities", labelKey: "nav.communities", icon: Users, rail: true },
    ],
  },
  {
    labelKey: "nav.groupWork",
    items: [
      // Promptly Spaces (docs/history/213-*): ziyaretçi de herkese açık Space'leri görür.
      { href: "/spaces", labelKey: "nav.spaces", icon: Shapes, rail: true },
      // Ekipler (docs/history/350-*): tamamen kapalı topluluk = ekip; günlük çalışma alanı, Topluluklar'dan ayrı bir giriş.
      { href: "/teams", labelKey: "nav.teams", icon: Briefcase, visibility: "authenticated", rail: true },
      { href: "/studio", labelKey: "nav.studio", icon: WandSparkles },
    ],
  },
  {
    labelKey: "nav.groupLibrary",
    items: [
      { href: "/saved", labelKey: "nav.saved", icon: Bookmark, match: "/saved", visibility: "authenticated", rail: true, railLabelKey: "nav.savedRail" },
      { href: "/following", labelKey: "nav.followingPeople", icon: UsersRound, visibility: "authenticated", tileLabelKey: "nav.followingTile" },
      // Yaratıcı paneli (docs/history/294-*): kişinin kendi promptlarının performansı.
      { href: "/insights", labelKey: "nav.insights", icon: BarChart3, visibility: "authenticated", tileLabelKey: "nav.insightsTile" },
    ],
  },
];

/**
 * «Sen» sayfasındaki kısayol kutularının sırası (telefon): alt çubukta olmayan her hedef. Topluluklar alt çubuktan buraya taşındı
 * (docs/history/460-*: alt çubuk Ana Sayfa · Odak · Mesajlar · Bildirimler · Keşfet).
 */
const ACCOUNT_SHORTCUT_HREFS = ["/saved", "/spaces", "/communities", "/teams", "/following", "/insights", "/studio"];
export const accountShortcutItems: NavItem[] = ACCOUNT_SHORTCUT_HREFS.map((href) => navGroups.flatMap((group) => group.items).find((item) => item.href === href)!);

/** Shown to guests where a member sees their profile entry. */
export const guestLoginNavItem: NavItem = { href: "/login", labelKey: "header.login", icon: LogIn };

/** Odak's route — entered by a full page load, never a client-side swap (`FullLoadLink`, docs/history/249-*). */
export const FOCUS_HREF = "/focus";

/** Alt çubuktaki oturum isteyen hedefler: misafir dokununca giriş penceresi açılır (yuvalar yer değiştirmesin diye gizlenmez). */
export const MESSAGES_HREF = "/messages";
export const NOTIFICATIONS_HREF = "/notifications";

/**
 * Telefon alt çubuğu (docs/history/460-*): Ana Sayfa · Odak · Mesajlar · Bildirimler · Keşfet. Üstteki aktif çizgi 5 eşit yuvada kayar. «Sen» artık alt
 * çubukta değil, üst çubuğun sağındaki avatardır (`PhoneAccountButton`); Oluştur sağ alttaki mavi «+» hub'ıdır (`showsCreateHub`: yalnız Ana Sayfa,
 * Keşfet ve kendi profilin). Odak kendi tam ekran sayfasıdır (çubuk çizilmez, docs/history/248-*), bu yüzden orada hiçbir yuva "aktif" olmaz.
 * Keşfet arama kutusunu taşır (arama kendi sekmesi değildir). İkon: Keşfet her yerde Pusula (anlam başına tek ikon, docs/history/344-*).
 */
export const mobileNavItems: NavItem[] = [
  { href: "/", labelKey: "nav.home", icon: Home },
  { href: FOCUS_HREF, labelKey: "nav.focus", icon: Focus },
  { href: MESSAGES_HREF, labelKey: "header.messagesAriaLabel", icon: MessagesSquare, visibility: "authenticated" },
  { href: NOTIFICATIONS_HREF, labelKey: "header.notificationsAriaLabel", icon: Bell, visibility: "authenticated" },
  { href: "/discover", labelKey: "nav.discover", icon: Compass },
];

export function isNavItemActive(pathname: string, item: NavItem) {
  const prefixes = [item.match ?? item.href, ...(item.alsoMatch ?? [])];
  return prefixes.some((prefix) => (prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix)));
}

/** Central visibility filter: guests (and the loading state) only ever get public entries. */
export function filterNavItems(items: NavItem[], isAuthenticated: boolean): NavItem[] {
  return items.filter((item) => (item.visibility ?? "public") === "public" || isAuthenticated);
}
