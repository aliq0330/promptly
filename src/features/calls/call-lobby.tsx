"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Mic } from "@/components/icons/mic";
import { MicOff } from "@/components/icons/mic-off";
import { Video } from "@/components/icons/video";
import { VideoOff } from "@/components/icons/video-off";
import { Check } from "@/components/icons/check";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CallPeerInfo } from "@/lib/webrtc/types";
import { cn } from "@/lib/utils";
import { setCallDevices, useCallDevices } from "./call-prefs-store";
import { VideoFeed } from "./media-feed";
import { deviceLabel, useMediaDevices } from "./use-media-devices";

/**
 * Görüntülü arama hazırlık ekranı (docs/history/450-*): arama BAŞLAMADAN önce kamera önizlemesi, mikrofon seviyesi, aç/kapat ve cihaz
 * seçimi. Mikrofon/kamera izni "Görüntülü ara"ya basıldığı an alınmıştır (kullanıcı hareketi); burada seçilen aç/kapat durumu
 * `onStart`'a iletilir ve görüşme o durumla başlar. Cihaz değişince akış yenilenir (`onReacquire`).
 */
export function CallLobby({
  peer,
  stream,
  busy,
  onStart,
  onCancel,
  onReacquire,
}: {
  peer: CallPeerInfo;
  stream: MediaStream;
  busy: boolean;
  onStart: (state: { micOn: boolean; camOn: boolean }) => void;
  onCancel: () => void;
  onReacquire: () => void;
}) {
  const { t } = useTranslation();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [devices] = useCallDevices();
  const { mics, cameras } = useMediaDevices(true);
  const level = useMicLevel(stream, micOn);
  const name = peer.displayName || peer.username;

  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const pick = (kind: "mic" | "camera", id: string) => {
    setCallDevices({ [kind]: id });
    onReacquire();
  };
  const select = "h-10 w-full rounded-md border border-(--p-control-border) bg-surface px-3 text-small text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
  const round = "inline-flex h-12 w-12 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

  return (
    <div role="dialog" aria-modal="true" aria-label={t("calls.lobby.title")} data-call-lobby className="fixed inset-0 z-(--z-celebration) flex items-stretch justify-center bg-scrim animate-fade-in sm:items-center sm:p-6">
      <div className="flex w-full flex-col overflow-hidden bg-surface sm:max-w-md sm:rounded-xl sm:shadow-pop">
        <div className="px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <h2 className="font-display text-h2 text-text">{t("calls.lobby.title")}</h2>
          <p className="text-small text-text-secondary">{t("calls.lobby.subtitle", { name })}</p>
        </div>
        <div className="relative mx-5 aspect-[4/3] overflow-hidden rounded-lg bg-call-stage" aria-label={t("calls.lobby.preview")} data-lobby-preview>
          <VideoFeed stream={stream} mirrored off={!camOn} offLabel={t("calls.cameraOff")} />
        </div>
        <div className="flex items-center justify-center gap-4 px-5 pt-4">
          <button type="button" onClick={() => setMicOn((v) => !v)} aria-pressed={!micOn} aria-label={micOn ? t("calls.mute") : t("calls.unmute")} title={micOn ? t("calls.mute") : t("calls.unmute")} data-lobby-mic={micOn ? "on" : "off"} className={cn(round, micOn ? "bg-surface-soft text-text hover:bg-border-soft" : "bg-danger text-danger-foreground")}>
            {micOn ? <Mic size={24} aria-hidden /> : <MicOff size={24} aria-hidden />}
          </button>
          <button type="button" onClick={() => setCamOn((v) => !v)} aria-pressed={!camOn} aria-label={camOn ? t("calls.cameraOffAction") : t("calls.cameraOnAction")} title={camOn ? t("calls.cameraOffAction") : t("calls.cameraOnAction")} data-lobby-camera={camOn ? "on" : "off"} className={cn(round, camOn ? "bg-surface-soft text-text hover:bg-border-soft" : "bg-danger text-danger-foreground")}>
            {camOn ? <Video size={24} aria-hidden /> : <VideoOff size={24} aria-hidden />}
          </button>
        </div>
        <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-surface-soft" role="progressbar" aria-label={t("calls.lobby.level")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={micOn ? Math.round(level * 100) : 0}>
          <div className="h-full rounded-full bg-success transition-[width] duration-100" style={{ width: `${micOn ? Math.round(level * 100) : 0}%` }} />
        </div>
        {(mics.length > 1 || cameras.length > 1) && (
          <div className="mt-3 grid gap-2 px-5">
            {mics.length > 1 && (
              <select aria-label={t("calls.menu.mic")} className={select} value={devices.mic ?? mics[0]?.deviceId ?? ""} onChange={(e) => pick("mic", e.target.value)}>
                {mics.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {deviceLabel(d, i, t("calls.menu.micFallback"))}
                  </option>
                ))}
              </select>
            )}
            {cameras.length > 1 && (
              <select aria-label={t("calls.menu.camera")} className={select} value={devices.camera ?? cameras[0]?.deviceId ?? ""} onChange={(e) => pick("camera", e.target.value)}>
                {cameras.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {deviceLabel(d, i, t("calls.menu.cameraFallback"))}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
          <Button variant="outline" size="lg" className="flex-1" onClick={onCancel} disabled={busy} data-lobby-cancel>
            {t("calls.lobby.cancel")}
          </Button>
          <Button size="lg" className="flex-1" onClick={() => onStart({ micOn, camOn })} disabled={busy} data-lobby-start>
            <Check size={20} aria-hidden /> {busy ? t("calls.lobby.starting") : t("calls.lobby.start")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Mikrofon seviyesi (0..1): yalnız yerelde ölçülür, kaydedilmez/gönderilmez. AudioContext yoksa hep 0. */
function useMicLevel(stream: MediaStream, enabled: boolean): number {
  const [level, setLevel] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const Ctor: typeof AudioContext | undefined = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor || !enabled || stream.getAudioTracks().length === 0) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      source.disconnect();
      void ctx.close().catch(() => undefined);
    };
  }, [stream, enabled]);
  return level;
}
