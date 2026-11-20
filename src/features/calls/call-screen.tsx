"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { AlertCircle } from "@/components/icons/alert-circle";
import { Loader2 } from "@/components/icons/loader-2";
import { MicOff } from "@/components/icons/mic-off";
import { VideoOff } from "@/components/icons/video-off";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CallController } from "@/lib/webrtc/call-controller";
import { CALL_ENDED_DISMISS_MS, formatCallDuration, isTerminalPhase } from "@/lib/webrtc/call-rules";
import { startRingtone } from "@/lib/webrtc/ringtone";
import type { CallPeerInfo } from "@/lib/webrtc/types";
import { CallControls } from "./call-controls";
import { useWebRTCCall } from "./use-webrtc-call";

/**
 * Görüşme ekranı (docs/history/449-*): arama çalarken, bağlanırken, bağlıyken ve biterken AYNI katman. Masaüstünde ortalanmış kart, telefonda
 * tam ekran (güvenli alan payıyla). Sesli aramada avatar + süre; görüntülüde büyük uzak video + küçük yüzen kendi görüntün.
 * Uzak ses/görüntü yalnız `srcObject` ile bağlanır (hiçbir yere kaydedilmez/yüklenmez) ve ekran kapanırken bağlantı temizlenir.
 */
export function CallScreen({ controller, peer, onDismiss, onRetry }: { controller: CallController; peer: CallPeerInfo; onDismiss: () => void; onRetry?: () => void }) {
  const { t } = useTranslation();
  const { snapshot, seconds, hangup, toggleMic, toggleCamera } = useWebRTCCall(controller);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);

  const phase = snapshot?.phase ?? "ended";
  const isVideo = snapshot?.type === "video";
  const remoteStream = snapshot?.remoteStream ?? null;
  const localStream = snapshot?.localStream ?? null;
  const role = snapshot?.role;
  const name = peer.displayName || peer.username;

  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  // Uzak akış: video aramada <video> (ses de ondan), sesli aramada gizli <audio>. Tarayıcı oynatmayı engellerse dokunarak başlatılır.
  useEffect(() => {
    const el: HTMLMediaElement | null = isVideo ? remoteVideoRef.current : remoteAudioRef.current;
    if (!el || !remoteStream) return;
    el.srcObject = remoteStream;
    el.play().then(
      () => setNeedsTap(false),
      () => setNeedsTap(true),
    );
    return () => {
      el.srcObject = null;
    };
  }, [remoteStream, isVideo]);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream || !isVideo) return;
    el.srcObject = localStream;
    return () => {
      el.srcObject = null;
    };
  }, [localStream, isVideo]);

  // Arayanın duyduğu "çalıyor" sesi.
  useEffect(() => {
    if (role !== "caller" || phase !== "ringing") return;
    return startRingtone("ringback");
  }, [role, phase]);

  // Biten / reddedilen / cevapsız arama kısa süre sonra kapanır; başarısız arama kullanıcı kapatana kadar kalır (hata okunabilsin).
  useEffect(() => {
    if (phase !== "ended" && phase !== "rejected" && phase !== "missed") return;
    const id = setTimeout(onDismiss, CALL_ENDED_DISMISS_MS);
    return () => clearTimeout(id);
  }, [phase, onDismiss]);

  if (!snapshot) return null;
  const terminal = isTerminalPhase(phase);
  const live = !terminal;

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

  const showRemoteVideo = isVideo && phase === "connected" && remoteStream !== null && snapshot.remoteCamera;
  const waiting = phase === "calling" || phase === "ringing" || phase === "connecting" || (phase === "connected" && snapshot.unstable);

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
      <div className="relative flex w-full flex-col overflow-hidden bg-call-stage text-on-art sm:h-[min(86dvh,720px)] sm:max-w-3xl sm:rounded-xl sm:shadow-pop">
        {/* Sahne: görüntülüde uzak video; aksi hâlde avatar + ad + durum. */}
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
          {isVideo && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              data-remote-video
              className={showRemoteVideo ? "absolute inset-0 h-full w-full object-cover" : "hidden"}
            />
          )}
          {!isVideo && <audio ref={remoteAudioRef} autoPlay data-remote-audio />}

          {showRemoteVideo && (
            <div className="art-scrim-top pointer-events-none absolute inset-x-0 top-0 px-5 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
              <p className="truncate font-display text-h3 text-on-art">{name}</p>
              <p className="text-small text-on-art-muted" role="status" data-call-status>
                {statusText}
              </p>
            </div>
          )}

          {!showRemoteVideo && (
            <div className="relative flex w-full max-w-sm flex-col items-center gap-4 text-center">
              <Avatar src={peer.avatarUrl} alt="" size={128} />
              <h2 className="max-w-full truncate font-display text-h2 text-on-art">{name}</h2>
              <p className="inline-flex items-center gap-2 text-body text-on-art-muted" role={phase === "failed" ? "alert" : "status"} aria-live="polite" data-call-status>
                {waiting && <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />}
                {phase === "failed" && <AlertCircle size={16} aria-hidden />}
                {statusText}
              </p>
            </div>
          )}

          {/* Karşı tarafın mikrofon/kamera durumu */}
          {live && phase === "connected" && (!snapshot.remoteMic || (isVideo && !snapshot.remoteCamera)) && (
            <div className="absolute inset-x-0 bottom-3 flex flex-wrap items-center justify-center gap-2 px-4" data-call-remote-state>
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

          {/* Sesi başlatmak için dokun (iOS Safari/autoplay politikası) */}
          {needsTap && live && (
            <button
              type="button"
              data-call-tap-to-play
              onClick={() => {
                const el: HTMLMediaElement | null = isVideo ? remoteVideoRef.current : remoteAudioRef.current;
                void el?.play().then(() => setNeedsTap(false), () => {});
              }}
              className="absolute inset-x-6 top-1/2 inline-flex h-12 -translate-y-1/2 items-center justify-center rounded-full bg-surface px-5 text-body font-semibold text-text shadow-md"
            >
              {t("calls.tapToPlay")}
            </button>
          )}

          {/* Kendi görüntün: küçük yüzen önizleme (aynalı) */}
          {isVideo && live && (
            <div className="absolute bottom-3 right-3 h-36 w-28 overflow-hidden rounded-md bg-art-chip shadow-card sm:h-40 sm:w-32" data-local-preview>
              <video ref={localVideoRef} autoPlay playsInline muted aria-label={t("calls.localPreview")} className={snapshot.camOn ? "h-full w-full -scale-x-100 object-cover" : "hidden"} />
              {!snapshot.camOn && (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-small text-on-art-muted">
                  <VideoOff size={24} aria-hidden />
                  {t("calls.cameraOff")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Alt denetim çubuğu */}
        <div className="flex shrink-0 flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {live ? (
            <CallControls
              video={isVideo}
              micOn={snapshot.micOn}
              camOn={snapshot.camOn}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
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
