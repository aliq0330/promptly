"use client";

import { DoorClosed, Globe, Lock, type LucideIcon } from "lucide-react";
import { VISIBILITY_LABEL_KEYS } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupVisibility } from "@/types";

export const VISIBILITY_ICONS: Record<GroupVisibility, LucideIcon> = {
  public: Globe,
  restricted: DoorClosed,
  private: Lock,
};

/** Görünürlük düzeyinin ikon + metni (Herkese açık · Kapalı · Tamamen kapalı); her yerde aynı ikon/ad. */
export function VisibilityLabel({ visibility, size = 12, className }: { visibility: GroupVisibility; size?: number; className?: string }) {
  const { t } = useTranslation();
  const Icon = VISIBILITY_ICONS[visibility];
  return (
    <span className={className ?? "flex items-center gap-1 text-caption text-text-muted"}>
      <Icon size={size} aria-hidden /> {t(VISIBILITY_LABEL_KEYS[visibility])}
    </span>
  );
}
