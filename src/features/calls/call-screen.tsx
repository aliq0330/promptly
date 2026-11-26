"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { AlertCircle } from "@/components/icons/alert-circle";
import { Loader2 } from "@/components/icons/loader-2";
import { MicOff } from "@/components/icons/mic-off";
import { Shuffle } from "@/components/icons/shuffle";
import { VideoOff } from "@/components/icons/video-off";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CallController } from "@/lib/webrtc/call-controller";
import { CALL_ENDED_DISMISS_MS, formatCallDuration, isTerminalPhase } from "@/lib/webrtc/call-rules";
import { startRingtone } from "@/lib/webrtc/ringtone";
import type { CallPeerInfo } from "@/lib/webrtc/types";
import { Minimize2 } from "@/components/icons/minimize-2";
import { cn } from "@/lib/utils";
import { CallControls } from "./call-controls";
import { CallMenu } from "./call-menu";
import { QualityChip } from "./quality-chip";
import { getCallPrefs, setCallDevices, useCallDevices } from "./call-prefs-store";
import { useCornerDrag } from "./use-corner-drag";
import { VideoFeed } from "./media-feed";
import type { useWebRTCCall } from "./use-webrtc-call";

type CallApi = ReturnType<typeof useWebRTCCall>;

/**
 * Görüşme ekranı (docs/history/450-*): arama çalarken, bağlanırken, bağlıyken ve biterken AYNI katman. Masaüstünde ortalanmış kart, telefonda tam
 * ekran. Görüntülüde: büyük görüntü + KÜÇÜK PENCERE; küçük pencere fareyle/parmakla taşınır (köşelere yapışır), dokununca iki görüntü yer
 * değiştirir (kendin büyük, konuşan küçük). Sol üstteki "Küçült" görüşmeyi her sayfada duran mini pencereye çevirir (sağlayıcı yönetir).
 * Uzak ses `RemoteAudio`'dan çalar (burada ses öğesi yok), böylece küçültme/yer değiştirme sesi kesmez.
 */
export function CallScreen({
  call,
  controller,
  peer,
  audioBlocked,
  onResumeAudio,
  onMinimize,
  onDismiss,
  onRetry,
}: {
  call: CallApi;
  controller: CallController;
  peer: CallPeerInfo;
  audioBlocked: boolean;
  onResumeAudio: () => void;
  onMinimize: () => void;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const { snapshot, seconds, hangup, toggleMic, toggleCamera } = call;
  const cardRef = useRef<HTMLDivElement>(null);
  const [swapped, setSwapped] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [devices] = useCallDevices();

  const phase = snapshot?.phase ?? "ended";
  const isVideo = snapshot?.type === "video";
  const role = snapshot?.role;
  const terminal = isTerminalPhase(phase);
  const live = !terminal;
  const showPip = isVideo && live;
  const name = peer.displayName || peer.username;

  const { ref: pipRef, place: placePip, cornerRef: pipCorner } = useCornerDrag<HTMLDivElement>({
    containerRef: cardRef,
    initialCorner: "tr",
    margin: 14,
    insets: { top: 56, bottom: 84 },
    onTap: () => setSwapped((s) => !s),
    enabled: isVideo,
  });
  // Küçük pencere görünür olunca (ya da yer değiştirince boyut değişirse) köşesine yeniden oturur.
  useEffect(() => {
    if (showPip) placePip(pipCorner.current);
  }, [showPip, placePip, pipCorner]);

  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  // Arayanın duyduğu "çalıyor" sesi (cihaz tercihi: zil sesi kapalıysa çalmaz).
  useEffect(() => {
    if (role !== "caller" || phase !== "ringing" || !getCallPrefs().ringSound) return;
    return startRingtone("ringback");
  }, [role, phase]);

  // Biten / reddedilen / cevapsız arama kısa süre sonra kapanır; başarısız arama kullanıcı kapatana kadar kalır (hata okunabilsin).
  useEffect(() => {
    if (phase !== "ended" && phase !== "rejected" && phase !== "missed") return;
    const id = setTimeout(onDismiss, CALL_ENDED_DISMISS_MS);
    return () => clearTimeout(id);
  }, [phase, onDismiss]);

  if (!snapshot) return null;

  const statusText = (() => {
    switch (phase) {
      case "calling":
        return t("calls.status.calling");
      case "ringing":
        return t("calls.status.ringing");
      case "connecting":
        return t("calls.status.connecting");
      case "connected":
        return snapshot.unstable ? t("calls.status.unstable") : formatCallDuration(seconds);
      case "ended":
        return t("calls.status.ended");
      case "rejected":
        return t("calls.status.rejected");
      case "missed":
        return t("calls.status.missed");
      case "failed":
        return snapshot.failure === "signaling" ? t("calls.status.failedSignaling") : t("calls.status.failed");
      default:
        return "";
    }
  })();

  const connected = phase === "connected";
  const waiting = phase === "calling" || phase === "ringing" || phase === "connecting" || (connected && snapshot.unstable);
  const remoteOn = connected && snapshot.remoteStream !== null && snapshot.remoteCamera;

  const remoteFeed = (
    <VideoFeed stream={snapshot.remoteStream} off={!remoteOn} offLabel={t("calls.remoteCameraOff", { name })} label={name} dataAttr={{ "data-remote-video": "" }} />
  );
  const localFeed = <VideoFeed stream={snapshot.localStream} mirrored off={!snapshot.camOn} offLabel={t("calls.cameraOff")} label={t("calls.you")} />;

  const avatarPanel = (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Avatar src={peer.avatarUrl} alt="" size={128} className={cn(phase === "ringing" && "ring-4 ring-primary/40")} />
      <h2 className="max-w-full truncate font-display text-h2 text-on-art">{name}</h2>
      <p className="inline-flex items-center gap-2 text-body text-on-art-muted" role={phase === "failed" ? "alert" : "status"} aria-live="polite" data-call-status>
        {waiting && <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />}
        {phase === "failed" && <AlertCircle size={16} aria-hidden />}
        {statusText}
      </p>
    </div>
  );

  // Ana alan: görüntülüde bağlanınca (ya da yer değiştirince) görüntü; aksi hâlde avatar + durum.
  const showMainFeed = isVideo && live && (swapped || connected);
  const mainContent = showMainFeed ? (swapped ? localFeed : remoteFeed) : avatarPanel;
  const pipContent = swapped ? remoteFeed : localFeed;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("calls.screen.aria")}
      data-call-screen
      data-call-phase={phase}
      data-call-type={snapshot.type}
      className="fixed inset-0 z-(--z-celebration) flex items-stretch justify-center bg-scrim animate-fade-in sm:items-center sm:p-6"
    >
      <div ref={cardRef} className="relative flex w-full flex-col overflow-hidden bg-call-stage text-on-art sm:h-[min(86dvh,720px)] sm:max-w-3xl sm:rounded-xl sm:shadow-pop">
        <div className="relative min-h-0 flex-1">
          {mainContent}

          {/* Üst şerit: küçült · (görüntü varken) ad + durum · bağlantı kalitesi. Avatar panelinde ad/durum zaten ortada durur. */}
          {live && (
            <div className={cn("absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]", showMainFeed ? "art-scrim-top pb-10" : "pb-2")}>
              <button type="button" onClick={onMinimize} aria-label={t("calls.minimize")} title={t("calls.minimize")} data-call-minimize className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-art-chip text-on-art hover:bg-art-chip/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                <Minimize2 size={20} aria-hidden />
              </button>
              {showMainFeed ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-h3 text-on-art">{name}</p>
                  <p className="text-small text-on-art-muted" role="status" data-call-status>
                    {statusText}
                  </p>
                </div>
              ) : (
                <div className="flex-1" />
              )}
              {connected && <QualityChip quality={snapshot.quality} unstable={snapshot.unstable} />}
            </div>
          )}

          {/* Karşı tarafın mikrofon/kamera durumu */}
          {live && connected && (!snapshot.remoteMic || (isVideo && !snapshot.remoteCamera && !swapped)) && (
            <div className="absolute inset-x-0 bottom-3 z-10 flex flex-wrap items-center justify-center gap-2 px-4" data-call-remote-state>
              {!snapshot.remoteMic && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-art-chip px-3 py-1 text-small text-on-art">
                  <MicOff size={16} aria-hidden /> {t("calls.remoteMuted", { name })}
                </span>
              )}
              {isVideo && !snapshot.remoteCamera && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-art-chip px-3 py-1 text-small text-on-art">
                  <VideoOff size={16} aria-hidden /> {t("calls.remoteCameraOff", { name })}
                </span>
              )}
            </div>
          )}

          {/* Sesi başlatmak için dokun (iOS Safari / autoplay politikası) */}
          {audioBlocked && live && (
            <button
              type="button"
              data-call-tap-to-play
              onClick={onResumeAudio}
              className="absolute inset-x-6 top-1/2 z-20 inline-flex h-12 -translate-y-1/2 items-center justify-center rounded-full bg-surface px-5 text-body font-semibold text-text shadow-md"
            >
              {t("calls.tapToPlay")}
            </button>
          )}

          {/* KÜÇÜK PENCERE: taşınır (köşelere yapışır), dokununca görüntüler yer değiştirir */}
          {isVideo && (
            <div
              ref={pipRef}
              role="button"
              tabIndex={showPip ? 0 : -1}
              hidden={!showPip}
              data-local-preview
              data-pip-swapped={swapped ? "true" : "false"}
              aria-label={swapped ? t("calls.pip.ariaSwapped") : t("calls.pip.aria")}
              title={t("calls.pip.hint")}
              className="absolute z-20 h-36 w-28 cursor-grab touch-none overflow-hidden rounded-md border-2 border-on-art/90 bg-call-stage shadow-card data-[dragging]:cursor-grabbing sm:h-48 sm:w-36 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              style={{ left: 0, top: 0 }}
            >
              {pipContent}
              <span aria-hidden className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-art-chip text-on-art">
                <Shuffle size={16} />
              </span>
            </div>
          )}
        </div>

        {/* Alt denetim çubuğu */}
        <div className="relative flex shrink-0 flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {menuOpen && live && (
            <CallMenu
              video={isVideo}
              rev={snapshot.devicesRev}
              activeMic={activeDeviceId(snapshot.localStream, "audio") ?? devices.mic}
              activeCamera={activeDeviceId(snapshot.localStream, "video") ?? devices.camera}
              activeSpeaker={devices.speaker}
              onPickMic={(id) => {
                setCallDevices({ mic: id });
                void controller.switchInput("audio", { deviceId: id });
              }}
              onPickCamera={(id) => {
                setCallDevices({ camera: id });
                void controller.switchInput("video", { deviceId: id });
              }}
              onPickSpeaker={(id) => setCallDevices({ speaker: id })}
              onFlip={() => {
                setMenuOpen(false);
                void controller.flipCamera();
              }}
              onSwap={() => {
                setSwapped((s) => !s);
                setMenuOpen(false);
              }}
              onClose={() => setMenuOpen(false)}
              className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2"
            />
          )}
          {live ? (
            <CallControls
              video={isVideo}
              micOn={snapshot.micOn}
              camOn={snapshot.camOn}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
              onMore={() => setMenuOpen((open) => !open)}
              moreOpen={menuOpen}
              onEnd={hangup}
              endLabel={role === "caller" && (phase === "calling" || phase === "ringing") ? t("calls.cancel") : t("calls.end")}
            />
          ) : phase === "failed" || phase === "missed" ? (
            <div className="flex items-center gap-3">
              {onRetry && (
                <Button variant="secondary" size="lg" onClick={onRetry} data-call-retry>
                  {t("calls.retry")}
                </Button>
              )}
              <Button variant="outline" size="lg" onClick={onDismiss} data-call-close>
                {t("calls.close")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Yerel akışın şu anki izinin cihaz kimliği (menüde seçili öğeyi işaretlemek için). */
function activeDeviceId(stream: MediaStream, kind: "audio" | "video"): string | null {
  const track = (kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks())[0];
  return track?.getSettings?.().deviceId ?? null;
}
