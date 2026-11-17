"use client";

import type { IconComponent } from "@/components/icons/icon";
import { DoorClosed } from "@/components/icons/door-closed";
import { Globe } from "@/components/icons/globe";
import { Lock } from "@/components/icons/lock";
import { VISIBILITY_LABEL_KEYS } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { VisibilityTag } from "@/components/ui/visibility-tag";
import type { GroupVisibility } from "@/types";

export const VISIBILITY_ICONS: Record<GroupVisibility, IconComponent> = {
  public: Globe,
  restricted: DoorClosed,
  private: Lock,
};

/**
 * Görünürlük düzeyinin ikon + metni (Herkese açık · Kapalı); her yerde aynı ikon/ad. Varsayılan Space/Ekip ile aynı hap (`VisibilityTag`);
 * `className` verilen satır içi bağlamlarda (bilgi sayfası, sohbet satırı) eski düz metin görünümü kalır.
 */
export function VisibilityLabel({ visibility, size = 12, className }: { visibility: GroupVisibility; size?: number; className?: string }) {
  const { t } = useTranslation();
  const Icon = VISIBILITY_ICONS[visibility];
  const label = t(VISIBILITY_LABEL_KEYS[visibility]);
  if (!className) return <VisibilityTag icon={Icon} label={label} />;
  return (
    <span className={className}>
      <Icon size={size} aria-hidden /> {label}
    </span>
  );
}
