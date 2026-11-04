"use client";

import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PresenceView } from "@/lib/presence";
import { usePresence } from "./use-presence";

/**
 * Çevrimiçi göstergesinin TEK görünümü (docs/history/329-*). Her ekran bunları kullanır; hiçbir sayfa kendi yeşil noktasını çizmez.
 * Nokta yalnız sunucu "görebilirsin" dediğinde ve kişi çevrimiçiyken görünür; hareket/animasyon yok.
 */

/** Avatar boyutuna göre nokta çapı (küçük ve sade: 8–14 px). */
export function presenceDotSize(avatarSize: number): number {
  return Math.max(8, Math.min(14, Math.round(avatarSize * 0.26)));
}

/** Yalnız nokta: avatar sarmalayıcısının sağ altına (avatar dairesinin kenarına) oturur. Çevrimdışıyken hiçbir şey çizmez. */
export function PresenceDot({
  online,
  avatarSize,
  className,
  outside = false,
  borderInset = 0,
}: {
  online: boolean;
  avatarSize: number;
  className?: string;
  /** true = noktayı dairenin DIŞINA, kenarına teğet koy (hikâye halkası olan avatarda halkanın üstüne binmesin). */
  outside?: boolean;
  /** Konumlandıran kutunun kenarlık kalınlığı (absolute konum dolgu kutusuna göredir; halkalı profil kutusu 3 px). */
  borderInset?: number;
}) {
  const { t } = useTranslation();
  if (!online) return null;
  const d = presenceDotSize(avatarSize);
  // Dairenin 45°'deki kenarı: merkezden r·0.707 — nokta oraya ortalanır (büyük avatarda köşeye yapışıp halkadan taşmaz).
  // `outside`: nokta merkezi r + d/2 uzaklığa çekilir, böylece halkaya yalnız dışarıdan değer.
  const r = avatarSize / 2;
  const centre = outside ? r + d / 2 + 1 : r;
  const offset = Math.round(r - centre * 0.7071 - d / 2) - borderInset;
  return (
    <span
      role="img"
      aria-label={t("presence.online")}
      title={t("presence.online")}
      data-presence-dot
      className={cn("pointer-events-none absolute z-[1] rounded-full bg-success ring-2 ring-surface", className)}
      style={{ width: d, height: d, right: offset, bottom: offset }}
    />
  );
}

/** Kişiye bağlı nokta (kendi durumunu okur). */
export function UserPresenceDot({
  userId,
  avatarSize,
  className,
  outside,
  borderInset,
}: {
  userId: string | null | undefined;
  avatarSize: number;
  className?: string;
  outside?: boolean;
  borderInset?: number;
}) {
  const view = usePresence(userId);
  return <PresenceDot online={view.online} avatarSize={avatarSize} className={className} outside={outside} borderInset={borderInset} />;
}

/** `Avatar` + çevrimiçi noktası. `userId` yoksa düz avatar. */
export function PresenceAvatar({
  userId,
  src,
  alt,
  size = 40,
  className,
}: {
  userId: string | null | undefined;
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  if (!userId) return <Avatar src={src} alt={alt} size={size} className={className} />;
  return <Avatar src={src} alt={alt} size={size} className={className} badge={<UserPresenceDot userId={userId} avatarSize={size} />} />;
}

/** "Çevrimiçi" / "Son görülme 5 dakika önce" metni; görülemiyorsa `null`. */
export function usePresenceLabel(view: PresenceView): string | null {
  const { t, language } = useTranslation();
  if (!view.visible) return null;
  if (view.online) return t("presence.online");
  if (view.lastSeenAt) return t("presence.lastSeen", { time: formatRelativeTime(view.lastSeenAt, language) });
  return null;
}

/** Durum satırı (sohbet başlığı, kişi bilgisi, profil Hakkında). Görülemiyorsa hiçbir şey çizmez — gizli olduğu da söylenmez. */
export function PresenceStatusText({
  userId,
  className,
  fallback,
  showDot = true,
}: {
  userId: string | null | undefined;
  className?: string;
  /** Durum görülemiyorsa yerine gösterilecek metin (ör. "@kullanıcı"). */
  fallback?: string | null;
  showDot?: boolean;
}) {
  const view = usePresence(userId);
  const label = usePresenceLabel(view);
  const text = label ?? fallback ?? null;
  if (!text) return null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)} data-presence-status={view.online ? "online" : view.visible ? "last-seen" : "none"}>
      {view.online && showDot && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-success" />}
      <span className="truncate">{text}</span>
    </span>
  );
}

/** "N çevrimiçi" küçük satır (topluluk sohbeti başlığı, kartlar, davet sayfası). */
export function OnlineCountText({
  count,
  className,
  variant = "online",
}: {
  count: number | null | undefined;
  className?: string;
  /** online = "N çevrimiçi", active = "N aktif" (kart), activeLong = "N üye şu an aktif" (davet sayfası). */
  variant?: "online" | "active" | "activeLong";
}) {
  const { t } = useTranslation();
  if (typeof count !== "number" || count <= 0) return null;
  const shown = count >= 10_000 ? "10.000+" : count.toLocaleString();
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} data-online-count={count}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-success" />
      {t(variant === "online" ? "presence.onlineCount" : variant === "active" ? "presence.activeShort" : "presence.activeCount", { count: shown })}
    </span>
  );
}
