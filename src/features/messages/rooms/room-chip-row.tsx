"use client";

import { ChevronDown } from "@/components/icons/chevron-down";
import { Hash } from "@/components/icons/hash";
import { OnlineCountText } from "@/features/presence/presence-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { CommunityRoom } from "@/types";

/**
 * Oda sohbetinin başlık altındaki satırı (docs/history/352-*, mockup 3): solda "# Oda adı ▾" çipi (oda değiştiriciyi açar), sağda çevrimiçi sayısı.
 * Çip yalnız topluluk sohbetinde, odalar yüklendiyse çizilir.
 */
export function RoomChipRow({
  room,
  online,
  onOpenSwitcher,
  className,
}: {
  room: CommunityRoom;
  online: number | null;
  onOpenSwitcher: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div data-room-chip-row className={cn("flex items-center justify-between gap-2 px-3 pb-2 pt-1 lg:px-5", className)}>
      <button
        type="button"
        onClick={onOpenSwitcher}
        aria-haspopup="dialog"
        aria-label={t("rooms.chat.switchAria", { name: room.name })}
        data-room-chip
        className="flex h-11 min-w-0 items-center gap-1.5 rounded-full border border-border-soft bg-surface px-3.5 text-body font-bold text-primary transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Hash size={18} strokeWidth={2.2} className="shrink-0" aria-hidden />
        <span className="truncate">{room.name}</span>
        <ChevronDown size={18} strokeWidth={2.2} className="shrink-0" aria-hidden />
      </button>
      {online ? (
        <span
          data-room-online
          role="status"
          aria-label={t("rooms.chat.onlineAria", { count: online })}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-border-soft bg-surface px-3.5 text-small font-semibold text-text"
        >
          <OnlineCountText count={online} />
        </span>
      ) : null}
    </div>
  );
}
