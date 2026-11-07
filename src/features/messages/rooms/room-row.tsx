"use client";

import Link from "next/link";
import { BellOff } from "@/components/icons/bell-off";
import { Check } from "@/components/icons/check";
import { Lock } from "@/components/icons/lock";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatUnread } from "@/lib/utils";
import type { CommunityRoom } from "@/types";
import { RoomIconTile } from "./room-icon";

/** Satırın ikinci satırı: durum (şu an buradasın / sessize alınmış / salt okunur…) öncelikli, yoksa odanın açıklaması. */
function useRoomSubtitle(room: CommunityRoom, current: boolean): string | null {
  const { t } = useTranslation();
  if (current) return t("rooms.row.current");
  if (room.archivedAt) return t("rooms.row.archived");
  if (room.readPolicy === "staff") return t("rooms.row.privateStaff");
  if (room.muted) return t("rooms.row.muted");
  if (!room.isDefault && room.postingPolicy === "admins") return t("rooms.row.readOnlyStaff");
  return room.description;
}

/**
 * Bir sohbet odasının tek satırı — sohbet merkezinde, oda değiştiricide ve masaüstü ağaçta AYNI görünüm (docs/history/352-*).
 * Sağ ucta durum: okunmamış sayısı (mavi hap), yalnız yönetimin yazdığı odada okunmamış varsa nokta, sessiz/salt okunur/özel simgesi.
 */
export function RoomRow({
  room,
  current = false,
  href,
  onSelect,
  density = "comfortable",
  trailing,
}: {
  room: CommunityRoom;
  current?: boolean;
  href?: string;
  onSelect?: (room: CommunityRoom) => void;
  density?: "comfortable" | "compact";
  trailing?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const subtitle = useRoomSubtitle(room, current);
  const readOnly = !room.isDefault && room.postingPolicy === "admins" && !room.canPost;
  const unread = room.unreadCount > 0 && !room.muted && !room.archivedAt;
  const showDot = unread && readOnly;
  const compact = density === "compact";
  const rowClass = cn(
    "flex w-full items-center gap-3 rounded-lg text-left transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    compact ? "px-2.5 py-1.5" : "px-2.5 py-2",
    current ? "bg-primary-soft" : "hover:bg-surface-soft",
  );
  const content = (
    <>
      <RoomIconTile icon={room.icon} size={compact ? 36 : 44} selected={current} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-body tracking-[-0.01em]", unread || current ? "font-bold text-text" : "font-semibold text-text")}>{room.name}</span>
        {subtitle && <span className={cn("block truncate text-caption", current ? "font-semibold text-primary" : "text-text-muted")}>{subtitle}</span>}
      </span>
      {readOnly && <Lock size={16} className="shrink-0 text-text-muted" aria-label={t("rooms.row.readOnly")} />}
      {room.readPolicy === "staff" && !readOnly && <Lock size={16} className="shrink-0 text-text-muted" aria-label={t("rooms.row.private")} />}
      {room.muted && <BellOff size={16} className="shrink-0 text-text-muted" aria-label={t("rooms.row.muted")} />}
      {showDot && <span role="img" aria-label={t("rooms.row.unreadDot")} className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
      {unread && !showDot && (
        <span data-room-unread className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-bold text-primary-foreground">
          {formatUnread(room.unreadCount)}
        </span>
      )}
      {current && <Check size={20} strokeWidth={2.6} className="shrink-0 text-primary" aria-hidden />}
      {trailing}
    </>
  );
  if (href) {
    return (
      <Link href={href} data-room-row={room.id} aria-current={current ? "true" : undefined} className={rowClass}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" data-room-row={room.id} aria-current={current ? "true" : undefined} onClick={() => onSelect?.(room)} className={rowClass}>
      {content}
    </button>
  );
}
