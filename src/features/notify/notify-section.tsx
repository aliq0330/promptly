"use client";

import type { ReactNode } from "react";
import { OptionGroup, type OptionItem } from "@/components/ui/option-group";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { NotifyChatLevel, NotifyPick } from "@/lib/notify-standard";

/** Bildirim standardı (docs/history/484-*): Topluluk odası ve ekip kanalı AYNI "Bildirimler" bölümünü kullanır; seçenekler ve sözcükler tek yerde. */

export const NOTIFY_PICK_LABEL: Record<NotifyPick, TranslationKey> = {
  default: "notify.level.default",
  all: "notify.level.all",
  mentions: "notify.level.mentions",
  none: "notify.level.none",
};

/** Kanal (ekip) düzeylerinin açıklamaları; oda sohbetlerinde bildirim üretilmediği için odanın kendi açıklamaları vardır (`notify.room.*`). */
export const NOTIFY_CHANNEL_HINT: Record<NotifyChatLevel, TranslationKey> = {
  all: "th.notify.all",
  mentions: "th.notify.mentions",
  none: "th.notify.none",
};

/** Üst kademe (ekip/proje) sessizken: bu sohbetten bildirim gelmez, alttaki seçim saklıdır ama etkisizdir. Tek dokunuşla üstün sesi açılır. */
export function NotifyInheritBanner({ scope, busy, onUnmute }: { scope: "team" | "project"; busy?: boolean; onUnmute: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-channel-inherited={scope} className="space-y-1.5 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2.5">
      <p className="text-small font-semibold text-text">{t(scope === "team" ? "th.inherit.team" : "th.inherit.project")}</p>
      <p className="text-caption text-text-secondary">{t("th.inherit.note")}</p>
      <button
        type="button"
        data-channel-unmute-parent
        disabled={busy}
        onClick={onUnmute}
        className="text-small font-semibold text-primary-text hover:underline disabled:opacity-50"
      >
        {t(scope === "team" ? "th.inherit.unmuteTeam" : "th.inherit.unmuteProject")}
      </button>
    </div>
  );
}

/**
 * "Bildirimler" bölümü: seçenek kartları (Varsayılan · Tüm mesajlar · Bahsetmeler · Sessiz; kademe hangilerini sunuyorsa onlar) + isteğe bağlı miras bandı.
 * Seçenekleri çağıran kurar (`items`); sıra ve etiketler `NOTIFY_PICK_LABEL`'dan gelir.
 */
export function NotifySection<K extends NotifyPick>({
  heading,
  value,
  items,
  onChange,
  disabled,
  testId,
  banner,
}: {
  heading: string;
  value: K;
  items: { key: K; description: ReactNode }[];
  onChange: (next: K) => void;
  disabled?: boolean;
  /** Testler ve çözümleme için kademe adı: "room" | "channel". */
  testId: string;
  banner?: ReactNode;
}) {
  const { t } = useTranslation();
  const options: OptionItem<K>[] = items.map((item) => ({ key: item.key, label: t(NOTIFY_PICK_LABEL[item.key]), description: item.description }));
  return (
    <div className="space-y-2" data-notify-section={testId}>
      <p className="text-caption font-semibold text-text-muted">{heading}</p>
      {banner}
      <OptionGroup<K> value={value} options={options} onChange={onChange} ariaLabel={heading} disabled={disabled} />
    </div>
  );
}
