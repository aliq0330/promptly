"use client";

import { Hash } from "@/components/icons/hash";
import { Lock } from "@/components/icons/lock";
import { ScrollRow } from "@/components/ui/scroll-row";
import { cn, formatUnread } from "@/lib/utils";

export interface ChannelChip {
  id: string;
  name: string;
  /** Yalnız yönetim görür / özel kanal-oda: çipte kilit. */
  locked?: boolean;
  unread?: number;
  muted?: boolean;
}

/**
 * Ekip kanallarının ve topluluk odalarının TEK çip satırı (docs/history/353-*, Yön A mockup'ı): sohbet başlığının altında, açık olan seçili,
 * okunmamış sayı turuncu rozetle. Topluluk (teal) ve ekip (mavi) yalnız `tone` ile ayrışır; yerleşim aynı.
 */
export function ChannelChipsRow({
  items,
  activeId,
  onSelect,
  tone = "team",
  ariaLabel,
  className,
}: {
  items: readonly ChannelChip[];
  activeId: string | null;
  onSelect: (item: ChannelChip) => void;
  tone?: "team" | "community";
  ariaLabel: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div data-channel-chips className={cn("shrink-0 border-b border-border-soft bg-surface", className)}>
      <ScrollRow className="gap-2 px-3 py-2" role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const active = item.id === activeId;
          const unread = !item.muted && !active && (item.unread ?? 0) > 0;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-channel-chip={item.name}
              onClick={() => onSelect(item)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-small font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? tone === "team"
                    ? "bg-primary-soft text-primary"
                    : "bg-success/10 text-success"
                  : "bg-surface-soft text-text-secondary hover:bg-border-soft hover:text-text",
              )}
            >
              {item.locked ? <Lock size={13} aria-hidden /> : <Hash size={14} aria-hidden />}
              {item.name}
              {unread && <span className="rounded-full bg-secondary px-1.5 text-caption font-bold text-white">{formatUnread(item.unread ?? 0)}</span>}
            </button>
          );
        })}
      </ScrollRow>
    </div>
  );
}
