"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, Clock, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/features/settings/settings-ui";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { fetchDisabledNotificationPrefs, fetchNotificationMutes, setNotificationTypePref } from "@/lib/supabase/notifications";
import { NOTIFICATION_PREF_KEYS, type NotificationPrefKeyName } from "@/lib/notification-mirror";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { applyMute } from "@/features/notifications/mute-store";
import type { NotificationMute } from "@/types";

/**
 * Ayarlar → Bildirimler (docs/history/326-*). Tür anahtarları `notification_type_prefs` (satırı olmayan tür AÇIKTIR); kapalı tür için bildirim hiç yazılmaz
 * (BEFORE INSERT tetikleyicisi), yani Telegram'a da gitmez. Sessize alınanlar `notification_mutes`; kaldırınca bildirimler yeniden gelir (geçmişte gelmeyenler gelmez).
 */
export function NotificationSettings() {
  const { t } = useTranslation();
  const { snoozedCount } = useNotifications();
  const [disabled, setDisabled] = useState<Set<NotificationPrefKeyName>>(new Set());
  const [mutes, setMutes] = useState<NotificationMute[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [prefs, muteList] = await Promise.all([fetchDisabledNotificationPrefs(), fetchNotificationMutes()]);
      setDisabled(new Set(prefs));
      setMutes(muteList);
      setStatus("ready");
    } catch (err) {
      console.error("notification settings", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sayfa açılınca tercihler okunur
    void load();
  }, [load]);

  const toggle = async (key: NotificationPrefKeyName) => {
    if (busyKey) return;
    const turnOn = disabled.has(key);
    setBusyKey(key);
    setDisabled((prev) => {
      const next = new Set(prev);
      if (turnOn) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      await setNotificationTypePref(key, turnOn);
    } catch (err) {
      console.error("type pref", err);
      announceNotice(t("nc.actionFailed"));
      void load();
    } finally {
      setBusyKey(null);
    }
  };

  const unmute = async (mute: NotificationMute) => {
    setMutes((prev) => prev.filter((item) => !(item.kind === mute.kind && item.target === mute.target)));
    try {
      await applyMute(mute.kind, mute.target, mute.label, false);
    } catch (err) {
      console.error("unmute", err);
      announceNotice(t("nc.actionFailed"));
      void load();
    }
  };

  if (status === "error") {
    return (
      <SettingsCard title={t("nc.settings.title")}>
        <p className="text-small text-text-muted">{t("nc.loadFailed")}</p>
        <Button variant="outline" onClick={() => void load()}>{t("nc.retry")}</Button>
      </SettingsCard>
    );
  }

  return (
    <>
      <SettingsCard title={t("nc.settings.types")} hint={t("nc.settings.typesHint")}>
        {status === "loading" ? (
          <div aria-busy className="space-y-1.5" data-notification-pref-loading="">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-shimmer h-14 rounded-lg" />
            ))}
          </div>
        ) : (
        <ul className="space-y-1.5" data-notification-pref-list="">
          {NOTIFICATION_PREF_KEYS.map((key) => {
            const on = !disabled.has(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  disabled={busyKey === key}
                  onClick={() => void toggle(key)}
                  data-pref={key}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border-soft px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-soft disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text">{t(`nc.pref.${key}.title` as const)}</span>
                    <span className="block text-caption text-text-muted">{t(`nc.pref.${key}.hint` as const)}</span>
                  </span>
                  <span aria-hidden className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-border-strong")}>
                    <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]", on ? "left-[1.375rem]" : "left-0.5")} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        )}
      </SettingsCard>

      <SettingsCard title={t("nc.settings.muted")} hint={t("nc.settings.mutedHint")}>
        {mutes.length === 0 ? (
          <p className="flex items-center gap-2 text-small text-text-muted" data-mutes-empty="">
            <BellOff size={16} aria-hidden />
            {t("nc.settings.mutedEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border-soft" data-mute-list="">
            {mutes.map((mute) => (
              <li key={`${mute.kind}:${mute.target}`} className="flex items-center gap-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary">
                  {mute.kind === "actor" ? <UserRound size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-text">{mute.label || mute.target}</span>
                  <span className="block text-caption text-text-muted">{t(mute.kind === "actor" ? "nc.settings.mutedPerson" : "nc.settings.mutedContent")}</span>
                </span>
                <Button variant="outline" size="sm" className="h-9" onClick={() => void unmute(mute)} aria-label={t("nc.settings.unmute", { name: mute.label || mute.target })}>
                  <Trash2 size={14} aria-hidden />
                  {t("nc.settings.unmuteShort")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title={t("nc.settings.snoozed")} hint={t("nc.settings.snoozedHint")}>
        <div className="flex items-center gap-3">
          <Clock size={18} className="text-text-secondary" aria-hidden />
          <span className="flex-1 text-small text-text" data-snoozed-count="">{t("nc.settings.snoozedCount", { count: snoozedCount })}</span>
          <Link href="/notifications?view=snoozed" className="text-small font-semibold text-primary hover:underline">
            {t("nc.settings.snoozedOpen")}
          </Link>
        </div>
      </SettingsCard>
    </>
  );
}
