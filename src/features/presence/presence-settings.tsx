"use client";

import { useState } from "react";
import { OptionGroup } from "@/components/ui/option-group";
import { SettingsCard } from "@/features/settings/settings-ui";
import { PRESENCE_AUDIENCES, PRESENCE_MODES, type PresenceAudience, type PresenceMode } from "@/lib/presence";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useMyPresence } from "./presence-provider";

const MODE_LABEL: Record<PresenceMode, { label: TranslationKey; hint: TranslationKey }> = {
  auto: { label: "presence.mode.auto", hint: "presence.mode.autoHint" },
  invisible: { label: "presence.mode.invisible", hint: "presence.mode.invisibleHint" },
};

const AUDIENCE_LABEL: Record<PresenceAudience, { label: TranslationKey; hint: TranslationKey }> = {
  everyone: { label: "presence.audience.everyone", hint: "presence.audience.everyoneHint" },
  following: { label: "presence.audience.following", hint: "presence.audience.followingHint" },
  mutual: { label: "presence.audience.mutual", hint: "presence.audience.mutualHint" },
  nobody: { label: "presence.audience.nobody", hint: "presence.audience.nobodyHint" },
};

/**
 * Ayarlar → Gizlilik: çevrimiçi durumu (Otomatik / Görünmez) + kimler görebilir (docs/history/329-*). Değişiklik ANINDA uygulanır: sunucu kanal
 * anahtarını döndürür, açık sekmeler `BroadcastChannel` ile güncellenir. Kayıt başarısızsa seçim geri alınır.
 */
export function PresenceSettingsCard() {
  const { t } = useTranslation();
  const { me, available, update } = useMyPresence();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Seçim hemen görünür (iyimser); kayıt başarısızsa sunucudaki değere döner.
  const [optimistic, setOptimistic] = useState<{ mode?: PresenceMode; audience?: PresenceAudience } | null>(null);

  async function change(next: { mode?: PresenceMode; audience?: PresenceAudience }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    setOptimistic(next);
    try {
      await update(next);
      setSaved(true);
    } catch (err) {
      console.error("set_my_presence", err);
      setError(t("presence.saveFailed"));
    } finally {
      setOptimistic(null);
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t("presence.settingsTitle")} hint={t("presence.settingsHint")}>
      {!available || !me ? (
        <p className="text-caption text-text-muted" data-presence-settings="unavailable">
          {me === null && !available ? t("settings.loadingEllipsis") : t("presence.unavailable")}
        </p>
      ) : (
        <div className="space-y-4" data-presence-settings="ready">
          <OptionGroup<PresenceMode>
            ariaLabel={t("presence.settingsTitle")}
            value={optimistic?.mode ?? me.mode}
            disabled={busy}
            onChange={(mode) => void change({ mode })}
            options={PRESENCE_MODES.map((mode) => ({ key: mode, label: t(MODE_LABEL[mode].label), description: t(MODE_LABEL[mode].hint), attrs: { "data-presence-mode": mode } }))}
          />

          <div className="space-y-2">
            <p id="presence-audience-label" className="text-small font-medium text-text">
              {t("presence.audienceHint")}
            </p>
            <OptionGroup<PresenceAudience>
              labelledBy="presence-audience-label"
              value={optimistic?.audience ?? me.audience}
              disabled={busy}
              onChange={(audience) => void change({ audience })}
              options={PRESENCE_AUDIENCES.map((audience) => ({ key: audience, label: t(AUDIENCE_LABEL[audience].label), description: t(AUDIENCE_LABEL[audience].hint), attrs: { "data-presence-audience": audience } }))}
            />
          </div>

          <p className="rounded-lg bg-surface-soft px-4 py-3 text-caption leading-relaxed text-text-secondary">{t("presence.reciprocity")}</p>
          <p aria-live="polite" className="min-h-4 text-caption">
            {error ? <span className="text-danger">{error}</span> : saved ? <span className="text-text-muted">{t("presence.saved")}</span> : null}
          </p>
        </div>
      )}
    </SettingsCard>
  );
}
