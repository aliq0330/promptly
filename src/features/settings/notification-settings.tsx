"use client";

import { TrashIcon } from "@/components/ui/motion-icons";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellOff } from "@/components/icons/bell-off";
import { Clock } from "@/components/icons/clock";
import { UserRound } from "@/components/icons/user-round";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/features/settings/settings-ui";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { fetchDisabledNotificationPrefs, fetchNotificationMutes, setNotificationTypePref } from "@/lib/supabase/notifications";
import { NOTIFICATION_PREF_KEYS, type NotificationPrefKeyName } from "@/lib/notification-mirror";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { applyMute } from "@/features/notifications/mute-store";
import type { NotificationMute } from "@/types";
import { SwitchRow } from "@/components/ui/switch";
import { setLiveToastsEnabled, updateLiveNotifyPrefs, useLiveNotifyPrefs, useLiveToastsEnabled } from "@/features/notifications/live-toast-pref";
import { useQuietHours } from "@/features/notifications/quiet-hours-store";
import { Input } from "@/components/ui/field";
import { LIVE_TOAST_GROUPS, minutesToTime, timeToMinutes, isQuietNow, type LiveToastGroup } from "@/lib/live-notification-prefs";
import { playNotificationChime } from "@/lib/notification-sound";
import { CommentFollowSettings } from "./comment-follow-settings";

/**
 * Ayarlar → Bildirimler (docs/history/326-*). Tür anahtarları `notification_type_prefs` (satırı olmayan tür AÇIKTIR); kapalı tür için bildirim hiç yazılmaz
 * (BEFORE INSERT tetikleyicisi), yani Telegram'a da gitmez. Sessize alınanlar `notification_mutes`; kaldırınca bildirimler yeniden gelir (geçmişte gelmeyenler gelmez).
 */
export function NotificationSettings() {
  const { t } = useTranslation();
  const { snoozedCount } = useNotifications();
  const liveToasts = useLiveToastsEnabled();
  const livePrefs = useLiveNotifyPrefs();
  const { quiet, loaded: quietLoaded, save: saveQuiet } = useQuietHours();
  const [quietError, setQuietError] = useState(false);
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

  /** Sessiz saat değişikliği kaydedilir (hesap başına, sunucuda); saat dilimi tarayıcıdan alınır. */
  const changeQuiet = async (patch: Partial<typeof quiet>) => {
    setQuietError(false);
    const tz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || quiet.tz;
      } catch {
        return quiet.tz;
      }
    })();
    try {
      await saveQuiet({ ...quiet, ...patch, tz });
    } catch (err) {
      console.error("quiet hours", err);
      setQuietError(true);
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
      <SettingsCard title={t("nc.settings.live")} hint={t("nc.settings.liveHint")}>
        <SwitchRow
          checked={liveToasts}
          onChange={() => setLiveToastsEnabled(!liveToasts)}
          data-pref="live-toasts"
          className="min-h-14 rounded-lg border border-border-soft px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-small font-medium text-text">{t("nc.settings.liveTitle")}</span>
            <span className="block text-caption text-text-muted">{t("nc.settings.liveRowHint")}</span>
          </span>
        </SwitchRow>

        {liveToasts && (
          <div className="space-y-3" data-live-toast-groups="">
            <div className="space-y-1">
              <h4 className="text-small font-semibold text-text">{t("nc.settings.liveTypes")}</h4>
              <p className="text-caption leading-relaxed text-text-muted">{t("nc.settings.liveTypesHint")}</p>
            </div>
            <ul className="space-y-1.5">
              {LIVE_TOAST_GROUPS.map((group: LiveToastGroup) => (
                <li key={group}>
                  <SwitchRow
                    checked={livePrefs.types[group]}
                    onChange={() => updateLiveNotifyPrefs({ types: { [group]: !livePrefs.types[group] } })}
                    data-live-group={group}
                    className="min-h-14 rounded-lg border border-border-soft px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-soft"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-small font-medium text-text">{t(`nc.settings.liveType.${group}` as const)}</span>
                      <span className="block text-caption text-text-muted">{t(`nc.settings.liveType.${group}Hint` as const)}</span>
                    </span>
                  </SwitchRow>
                </li>
              ))}
            </ul>

            <SwitchRow
              checked={livePrefs.sound}
              onChange={() => updateLiveNotifyPrefs({ sound: !livePrefs.sound })}
              data-pref="live-sound"
              className="min-h-14 rounded-lg border border-border-soft px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-soft"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-small font-medium text-text">{t("nc.settings.liveSound")}</span>
                <span className="block text-caption text-text-muted">{t("nc.settings.liveSoundHint")}</span>
              </span>
            </SwitchRow>
            {livePrefs.sound && (
              <Button variant="outline" size="sm" data-action="sound-test" onClick={() => playNotificationChime()}>
                {t("nc.settings.liveSoundTest")}
              </Button>
            )}
          </div>
        )}
      </SettingsCard>

      <SettingsCard title={t("nc.settings.liveTabBadge")} hint={t("nc.settings.liveTabBadgeHint")}>
        <SwitchRow
          checked={livePrefs.tabBadge}
          onChange={() => updateLiveNotifyPrefs({ tabBadge: !livePrefs.tabBadge })}
          data-pref="tab-badge"
          className="min-h-14 rounded-lg border border-border-soft px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-small font-medium text-text">{t("nc.settings.liveTabBadgeRow")}</span>
          </span>
        </SwitchRow>
      </SettingsCard>

      <SettingsCard title={t("nc.settings.quiet")} hint={t("nc.settings.quietHint")}>
        {!quietLoaded ? (
          <div aria-busy className="skeleton-shimmer h-14 rounded-lg" data-quiet-loading="" />
        ) : (
          <div className="space-y-3" data-quiet-hours="">
            <SwitchRow
              checked={quiet.enabled}
              onChange={() => void changeQuiet({ enabled: !quiet.enabled })}
              data-pref="quiet-hours"
              className="min-h-14 rounded-lg border border-border-soft px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-soft"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-small font-medium text-text">{t("nc.settings.quietEnable")}</span>
                <span className="block text-caption text-text-muted">{t("nc.settings.quietEnableHint")}</span>
              </span>
            </SwitchRow>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="block text-label font-semibold text-text-secondary">{t("nc.settings.quietFrom")}</span>
                <Input
                  type="time"
                  dense
                  value={minutesToTime(quiet.startMinute)}
                  disabled={!quiet.enabled}
                  data-quiet-input="from"
                  onChange={(event) => {
                    const minute = timeToMinutes(event.target.value);
                    if (minute !== null) void changeQuiet({ startMinute: minute });
                  }}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-label font-semibold text-text-secondary">{t("nc.settings.quietTo")}</span>
                <Input
                  type="time"
                  dense
                  value={minutesToTime(quiet.endMinute)}
                  disabled={!quiet.enabled}
                  data-quiet-input="to"
                  onChange={(event) => {
                    const minute = timeToMinutes(event.target.value);
                    if (minute !== null) void changeQuiet({ endMinute: minute });
                  }}
                />
              </label>
            </div>
            <p className="text-caption text-text-muted">
              {t("nc.settings.quietTz", { tz: quiet.tz })}
              {isQuietNow(quiet) && <span className="ml-2 font-semibold text-text-secondary" data-quiet-now="">{t("nc.settings.quietNow")}</span>}
            </p>
            {quietError && (
              <p role="alert" className="text-caption font-semibold text-danger" data-quiet-error="">
                {t("nc.settings.quietSaveFailed")}
              </p>
            )}
          </div>
        )}
      </SettingsCard>

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
                <SwitchRow
                  checked={on}
                  onChange={() => void toggle(key)}
                  disabled={busyKey === key}
                  data-pref={key}
                  className="min-h-14 rounded-lg border border-border-soft px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-medium text-text">{t(`nc.pref.${key}.title` as const)}</span>
                    <span className="block text-caption text-text-muted">{t(`nc.pref.${key}.hint` as const)}</span>
                  </span>
                </SwitchRow>
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
                  <TrashIcon size={16} />
                  {t("nc.settings.unmuteShort")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <CommentFollowSettings />

      <SettingsCard title={t("nc.settings.snoozed")} hint={t("nc.settings.snoozedHint")}>
        <div className="flex items-center gap-3">
          <Clock size={20} className="text-text-secondary" aria-hidden />
          <span className="flex-1 text-small text-text" data-snoozed-count="">{t("nc.settings.snoozedCount", { count: snoozedCount })}</span>
          <Link href="/notifications?view=snoozed" className="text-small font-semibold text-primary-text hover:underline">
            {t("nc.settings.snoozedOpen")}
          </Link>
        </div>
      </SettingsCard>
    </>
  );
}
