import type { TranslationKey } from "./i18n/translations.ts";
import { ROUTE_TITLES } from "./route-titles.ts";

/** `/discover/` → `/discover` (`trailingSlash: true`); kök `/` olduğu gibi kalır. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Rotanın başlık anahtarı: sekme başlığı (`PageTitle`) ve telefondaki üst çubuk AYNI tablodan okur (`route-titles.ts`). */
export function routeTitleKey(pathname: string): TranslationKey | null {
  return ROUTE_TITLES[normalizePath(pathname)] ?? null;
}

/**
 * Telefon üst çubuğundaki sayfa adı (docs/history/462-*): bilinen rotada sayfanın adı, profilde «Profil»; ayrıntı sayfaları gibi başlığı olmayan
 * rotalarda `null` → çubuk logo yazısını (wordmark) gösterir.
 */
export function phoneTitleKey(pathname: string): TranslationKey | null {
  const path = normalizePath(pathname);
  const key = ROUTE_TITLES[path];
  if (key) return key;
  if (path === "/profile/real" || path.startsWith("/profile/")) return "nav.profile";
  return null;
}

/**
 * Sağ alttaki mavi «+» (Oluştur hub'ı, yalnız telefon): Ana Sayfa, Keşfet ve KENDİ profilinde görünür; başka sayfada ve başkasının profilinde yok.
 * Profil adresi `?username=` taşır; kendi profili = oturumdaki kullanıcının adı (büyük/küçük harf ayırmadan).
 */
export function showsCreateHub(pathname: string, usernameParam: string | null, ownUsername: string | null): boolean {
  const path = normalizePath(pathname);
  if (path === "/" || path === "/discover") return true;
  if (path === "/profile/real") {
    return Boolean(usernameParam && ownUsername && usernameParam.trim().toLowerCase() === ownUsername.trim().toLowerCase());
  }
  return false;
}

/**
 * Telefon üst çubuğu sayfanın adını zaten yazıyor: sayfanın kendi büyük başlığı AYNI metni taşıyorsa telefonda gizlenir (docs/history/463-*).
 * Karşılaştırma çevrilmiş metindir (`translate(anahtar) === başlık`), yani başka bir başlık (topluluk adı, kişi adı, alt sayfa adı) hiç etkilenmez.
 */
export function duplicatesPhoneTitle(pathname: string, text: string | null | undefined, translate: (key: TranslationKey) => string): boolean {
  if (!text) return false;
  const key = phoneTitleKey(pathname);
  return key !== null && translate(key).trim() === text.trim();
}
