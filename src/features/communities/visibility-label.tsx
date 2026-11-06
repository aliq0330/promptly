"use client";

import type { IconComponent } from "@/components/icons/icon";
import { DoorClosed } from "@/components/icons/door-closed";
import { Globe } from "@/components/icons/globe";
import { Lock } from "@/components/icons/lock";
import { VISIBILITY_LABEL_KEYS } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupVisibility } from "@/types";

export const VISIBILITY_ICONS: Record<GroupVisibility, IconComponent> = {
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
