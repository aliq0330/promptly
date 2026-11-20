"use client";

import { MoreVertical } from "@/components/icons/more-vertical";
import { Mic } from "@/components/icons/mic";
import { MicOff } from "@/components/icons/mic-off";
import { PhoneOff } from "@/components/icons/phone-off";
import { Video } from "@/components/icons/video";
import { VideoOff } from "@/components/icons/video-off";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

const ROUND = "inline-flex h-12 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 ease-soft active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-call-stage disabled:opacity-50";

/**
 * Görüşme denetimleri (docs/history/449-*): mikrofon · (görüntülüde) kamera · bitir. Her düğme erişilebilir ad + ipucu taşır, ≥48 px
 * dokunma alanıdır; kapalı durum yalnız renkle değil simgeyle de (üstü çizili mikrofon/kamera) anlatılır.
 */
export function CallControls({
  video,
  micOn,
  camOn,
  onToggleMic,
  onToggleCamera,
  onMore,
  moreOpen,
  onEnd,
  endLabel,
  className,
}: {
  video: boolean;
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onMore: () => void;
  moreOpen: boolean;
  onEnd: () => void;
  endLabel: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const micLabel = micOn ? t("calls.mute") : t("calls.unmute");
  const camLabel = camOn ? t("calls.cameraOffAction") : t("calls.cameraOnAction");
  return (
    <div className={cn("flex items-center justify-center gap-4", className)} data-call-controls>
      <button
        type="button"
        onClick={onToggleMic}
        aria-label={micLabel}
        title={micLabel}
        aria-pressed={!micOn}
        data-call-mic={micOn ? "on" : "off"}
        className={cn(ROUND, "w-12", micOn ? "bg-art-chip text-on-art hover:bg-art-chip/80" : "bg-surface text-text hover:bg-surface-soft")}
      >
        {micOn ? <Mic size={24} aria-hidden /> : <MicOff size={24} aria-hidden />}
      </button>
      {video && (
        <button
          type="button"
          onClick={onToggleCamera}
          aria-label={camLabel}
          title={camLabel}
          aria-pressed={!camOn}
          data-call-camera={camOn ? "on" : "off"}
          className={cn(ROUND, "w-12", camOn ? "bg-art-chip text-on-art hover:bg-art-chip/80" : "bg-surface text-text hover:bg-surface-soft")}
        >
          {camOn ? <Video size={24} aria-hidden /> : <VideoOff size={24} aria-hidden />}
        </button>
      )}
      <button
        type="button"
        onClick={onMore}
        aria-label={t("calls.menu.open")}
        title={t("calls.menu.open")}
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        data-call-more
        className={cn(ROUND, "w-12", moreOpen ? "bg-surface text-text" : "bg-art-chip text-on-art hover:bg-art-chip/80")}
      >
        <MoreVertical size={24} aria-hidden />
      </button>
      <button type="button" onClick={onEnd} aria-label={endLabel} title={endLabel} data-call-end className={cn(ROUND, "w-16 bg-danger text-danger-foreground hover:bg-danger/90")}>
        <PhoneOff size={24} aria-hidden />
      </button>
    </div>
  );
}
