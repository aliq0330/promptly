"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import type { CallQuality } from "@/lib/webrtc/types";
import { cn } from "@/lib/utils";

const LEVELS: Record<CallQuality, number> = { good: 4, mid: 2, low: 1 };

/**
 * Bağlantı kalitesi göstergesi (docs/history/450-*): dört çubuk + kelime (renk tek başına anlatmaz). Kopukken "Yeniden bağlanılıyor"
 * gösterir. Ölçüm henüz yoksa (null) hiçbir şey çizmez.
 */
export function QualityChip({ quality, unstable }: { quality: CallQuality | null; unstable: boolean }) {
  const { t } = useTranslation();
  if (!quality && !unstable) return null;
  const level = unstable ? 1 : LEVELS[quality ?? "good"];
  const label = unstable ? t("calls.quality.reconnecting") : t(quality === "good" ? "calls.quality.good" : quality === "mid" ? "calls.quality.mid" : "calls.quality.low");
  return (
    <span data-call-quality={unstable ? "reconnecting" : quality} role="status" aria-label={t("calls.quality.aria", { level: label })} className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-art-chip px-3 text-small font-semibold text-on-art">
      <span aria-hidden className="inline-flex h-3.5 items-end gap-0.5">
        {[1, 2, 3, 4].map((bar) => (
          <i key={bar} className={cn("w-[3px] rounded-xs bg-current", bar <= level ? "opacity-100" : "opacity-30")} style={{ height: `${bar * 25}%` }} />
        ))}
      </span>
      {label}
    </span>
  );
}
