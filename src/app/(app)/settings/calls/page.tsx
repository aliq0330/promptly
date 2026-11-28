"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionGroup } from "@/components/ui/option-group";
import { SwitchRow } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth-provider";
import { setCallDevices, useCallDevices, useCallPrefs } from "@/features/calls/call-prefs-store";
import { canPickSpeaker, deviceLabel, useMediaDevices } from "@/features/calls/use-media-devices";
import { SettingsCard, SettingsSubpage, SettingNested, SettingText } from "@/features/settings/settings-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { DEFAULT_CALL_SETTINGS, fetchMyCallSettings, saveMyCallSettings, type MyCallSettings } from "@/lib/supabase/calls";

const WHO = [
  { key: "everyone", label: "calls.settings.who.everyone", hint: "calls.settings.who.everyoneHint" },
  { key: "following", label: "calls.settings.who.following", hint: "calls.settings.who.followingHint" },
  { key: "nobody", label: "calls.settings.who.nobody", hint: "calls.settings.who.nobodyHint" },
] as const;

/**
 * Ayarlar → Aramalar (docs/history/450-*): hesap düzeyi (kim arayabilir, cevapsız arama bildirimi — veritabanında, sunucu zorlar) ve bu cihaza
 * özel tercihler (zil sesi, rahatsız etme saatlerine uyum, arka plan uyarısı, varsayılan cihazlar — yalnız tarayıcıda). Kaydetme iyimser;
 * hata olursa eski değere döner ve satır içi uyarı çıkar.
 */
export default function CallSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<MyCallSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useCallPrefs();
  const [devices] = useCallDevices();
  const { mics, cameras, speakers } = useMediaDevices(true);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  const load = () => {
    setLoadFailed(false);
    fetchMyCallSettings().then(setSettings, () => setLoadFailed(true));
  };
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sayfa açılınca hesap ayarlarını sunucudan çeker
    load();
  }, [user]);

  async function save(next: MyCallSettings) {
    if (saving || !settings) return;
    const previous = settings;
    setSettings(next);
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveMyCallSettings(next);
    } catch (error) {
      console.error("saveMyCallSettings", error);
      setSettings(previous);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function askNotifications() {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }

  if (loading || !user) return null;
  const current = settings ?? DEFAULT_CALL_SETTINGS;
  const select = "h-10 w-full rounded-sm border border-(--p-control-border) bg-surface px-3 text-small text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
  const labelsKnown = [...mics, ...cameras, ...speakers].some((d) => d.label);
  const picker = (id: string, title: string, list: MediaDeviceInfo[], value: string | null, kind: "mic" | "camera" | "speaker", fallback: string) =>
    list.length > 0 && (
      <label key={id} className="block">
        <span className="mb-1.5 block text-body font-semibold text-text">{title}</span>
        <select className={select} value={value && list.some((d) => d.deviceId === value) ? value : ""} onChange={(e) => setCallDevices({ [kind]: e.target.value || null })} data-call-device={kind}>
          <option value="">{t("calls.settings.default")}</option>
          {list.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {deviceLabel(device, index, fallback)}
            </option>
          ))}
        </select>
      </label>
    );

  return (
    <SettingsSubpage title={t("calls.settings.title")} description={t("calls.settings.description")}>
      {loadFailed && (
        <InlineAlert className="flex items-center justify-between gap-3">
          <span>{t("calls.settings.loadError")}</span>
          <Button type="button" variant="outline" size="sm" onClick={load}>
            {t("calls.list.retry")}
          </Button>
        </InlineAlert>
      )}
      {saveFailed && <InlineAlert>{t("calls.settings.saveError")}</InlineAlert>}

      <SettingsCard title={t("calls.settings.who")}>
        <OptionGroup
          ariaLabel={t("calls.settings.who")}
          value={current.privacy}
          disabled={!settings || saving}
          onChange={(privacy) => void save({ ...current, privacy })}
          options={WHO.map((option) => ({ key: option.key, label: t(option.label), description: t(option.hint), attrs: { "data-call-privacy": option.key } }))}
        />
        <SwitchRow checked={current.notifyMissed} disabled={!settings || saving} onChange={(next) => void save({ ...current, notifyMissed: next })} data-call-notify-missed="">
          <SettingText title={t("calls.settings.notifyMissed")} hint={t("calls.settings.notifyMissedHint")} />
        </SwitchRow>
      </SettingsCard>

      <SettingsCard title={t("calls.settings.thisDevice")} hint={t("calls.settings.thisDeviceHint")}>
        <SwitchRow checked={prefs.ringSound} onChange={(next) => setPrefs({ ringSound: next })} data-call-pref="ring">
          <SettingText title={t("calls.settings.ring")} hint={t("calls.settings.ringHint")} />
        </SwitchRow>
        <SwitchRow checked={prefs.respectQuietHours} onChange={(next) => setPrefs({ respectQuietHours: next })} data-call-pref="quiet">
          <SettingText title={t("calls.settings.quiet")} hint={t("calls.settings.quietHint")} />
        </SwitchRow>
        <SwitchRow checked={prefs.browserNotify} onChange={(next) => setPrefs({ browserNotify: next })} data-call-pref="browser">
          <SettingText title={t("calls.settings.browser")} hint={t("calls.settings.browserHint")} />
        </SwitchRow>
        {prefs.browserNotify && (permission === "default" || permission === "denied") && (
          <SettingNested>
            {permission === "default" && (
              <Button type="button" variant="outline" size="sm" onClick={() => void askNotifications()} data-call-notify-allow>
                {t("calls.settings.browserAllow")}
              </Button>
            )}
            {permission === "denied" && <InlineAlert tone="warning">{t("calls.settings.browserBlocked")}</InlineAlert>}
          </SettingNested>
        )}
      </SettingsCard>

      <SettingsCard title={t("calls.settings.devices")} hint={t("calls.settings.devicesHint")}>
        {picker("mic", t("calls.menu.mic"), mics, devices.mic, "mic", t("calls.menu.micFallback"))}
        {picker("camera", t("calls.menu.camera"), cameras, devices.camera, "camera", t("calls.menu.cameraFallback"))}
        {canPickSpeaker() && picker("speaker", t("calls.menu.speaker"), speakers, devices.speaker, "speaker", t("calls.menu.speakerFallback"))}
        {!labelsKnown && <p className="text-caption text-text-muted">{t("calls.settings.devicesLocked")}</p>}
      </SettingsCard>

      <p className="px-1 text-caption leading-relaxed text-text-muted" data-call-privacy-note="">
        {t("calls.settings.privacyNote")}
      </p>
    </SettingsSubpage>
  );
}
