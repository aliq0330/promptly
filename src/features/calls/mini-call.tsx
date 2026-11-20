"use client";

import { Avatar } from "@/components/ui/avatar";
import { Maximize2 } from "@/components/icons/maximize-2";
import { Mic } from "@/components/icons/mic";
import { MicOff } from "@/components/icons/mic-off";
import { PhoneOff } from "@/components/icons/phone-off";
import { Loader2 } from "@/components/icons/loader-2";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatCallDuration } from "@/lib/webrtc/call-rules";
import type { CallPeerInfo } from "@/lib/webrtc/types";
import { cn } from "@/lib/utils";
import { VideoFeed } from "./media-feed";
import { useCornerDrag } from "./use-corner-drag";
import type { useWebRTCCall } from "./use-webrtc-call";

type CallApi = ReturnType<typeof useWebRTCCall>;

/**
 * Küçültülmüş görüşme (docs/history/450-*): her sayfanın üstünde duran, sürüklenebilir (köşelere yapışan) küçük pencere. Görüntülüde karşı
 * tarafın görüntüsü, sesli görüşmede avatar + süre; mikrofon, bitir ve "Görüşmeye dön" düğmeleri. Pencerenin gövdesine dokunmak da ekranı
 * büyütür. Ses `RemoteAudio`'dan çalmaya devam eder (sağlayıcıda), bu bileşen ses öğesi taşımaz. Alt menüyü örtmesin diye telefonda altta
 * boşluk bırakır.
 */
export function MiniCall({ call, peer, onExpand }: { call: CallApi; peer: CallPeerInfo; onExpand: () => void }) {
  const { t } = useTranslation();
  const { snapshot, seconds, hangup, toggleMic } = call;
  const { ref: dragRef } = useCornerDrag<HTMLDivElement>({ initialCorner: "br", margin: 12, insets: { bottom: 72, top: 64 }, onTap: onExpand });
  if (!snapshot) return null;
  const name = peer.displayName || peer.username;
  const video = snapshot.type === "video";
  const connected = snapshot.phase === "connected";
  const remoteOn = connected && snapshot.remoteStream !== null && snapshot.remoteCamera;
  const waiting = !connected;
  const status = connected ? (snapshot.unstable ? t("calls.status.unstable") : formatCallDuration(seconds)) : snapshot.phase === "connecting" ? t("calls.status.connecting") : snapshot.phase === "ringing" ? t("calls.status.ringing") : t("calls.status.calling");
  const round = "inline-flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div
      ref={dragRef}
      role="group"
      tabIndex={0}
      aria-label={t("calls.mini.aria", { name })}
      title={t("calls.mini.hint")}
      data-mini-call
      data-call-phase={snapshot.phase}
      className={cn("fixed z-(--z-celebration) w-44 cursor-grab touch-none overflow-hidden rounded-lg bg-call-stage text-on-art shadow-pop data-[dragging]:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-52")}
      style={{ left: 0, top: 0 }}
    >
      <div className="relative aspect-[3/4] w-full sm:aspect-[4/3]">
        {video && remoteOn ? (
          <VideoFeed stream={snapshot.remoteStream} off={false} offLabel={t("calls.remoteCameraOff", { name })} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center">
            <Avatar src={peer.avatarUrl} alt="" size={56} />
            <p className="max-w-full truncate text-small font-semibold text-on-art">{name}</p>
          </div>
        )}
        <p className="art-scrim absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2.5 pb-1.5 pt-6 text-caption font-semibold text-on-art" role="status" data-call-status>
          {waiting && <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {status}
        </p>
      </div>
      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <button type="button" onClick={onExpand} aria-label={t("calls.expand")} title={t("calls.expand")} data-call-expand className={cn(round, "bg-art-chip hover:bg-art-chip/80")}>
          <Maximize2 size={16} aria-hidden />
        </button>
        <button type="button" onClick={toggleMic} aria-label={snapshot.micOn ? t("calls.mute") : t("calls.unmute")} title={snapshot.micOn ? t("calls.mute") : t("calls.unmute")} aria-pressed={!snapshot.micOn} data-call-mic={snapshot.micOn ? "on" : "off"} className={cn(round, snapshot.micOn ? "bg-art-chip hover:bg-art-chip/80" : "bg-surface text-text")}>
          {snapshot.micOn ? <Mic size={16} aria-hidden /> : <MicOff size={16} aria-hidden />}
        </button>
        <button type="button" onClick={hangup} aria-label={t("calls.end")} title={t("calls.end")} data-call-end className={cn(round, "bg-danger text-danger-foreground hover:bg-danger/90")}>
          <PhoneOff size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
