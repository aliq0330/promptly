"use client";

import { Phone } from "@/components/icons/phone";
import { Video } from "@/components/icons/video";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { CallPeerInfo } from "@/lib/webrtc/types";
import { useCalls } from "./call-provider";

/**
 * Birebir sohbet başlığındaki sesli / görüntülü arama düğmeleri (docs/history/449-*). Sağlayıcı yoksa hiçbir şey çizmez.
 * `disabledReason` doluysa (engel, bekleyen mesaj isteği, yazamama) düğmeler soluk ve basılamaz; ipucu nedenini söyler.
 * Yetkinin asıl denetimi sunucudadır (`call_start`); burası yalnız arayüzdür.
 */
export function ConversationCallButtons({
  conversationId,
  peer,
  disabledReason,
  buttonClassName,
}: {
  conversationId: string;
  peer: CallPeerInfo;
  disabledReason?: string | null;
  /** Başlık türüne göre düğme görünümü (sayfa başlığı / dock başlığı). */
  buttonClassName: string;
}) {
  const { t } = useTranslation();
  const calls = useCalls();
  if (!calls) return null;
  const name = peer.displayName || peer.username;
  const disabled = Boolean(disabledReason) || calls.busy;
  const hint = (label: string) => disabledReason ?? (calls.busy ? t("calls.inCall") : label);
  return (
    <>
      <button
        type="button"
        onClick={() => void calls.startCall({ conversationId, peer, type: "audio" })}
        disabled={disabled}
        aria-label={t("calls.startVoiceAria", { name })}
        title={hint(t("calls.startVoice"))}
        data-call-start="audio"
        className={cn(buttonClassName, "disabled:opacity-50")}
      >
        <Phone size={20} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => void calls.startCall({ conversationId, peer, type: "video" })}
        disabled={disabled}
        aria-label={t("calls.startVideoAria", { name })}
        title={hint(t("calls.startVideo"))}
        data-call-start="video"
        className={cn(buttonClassName, "disabled:opacity-50")}
      >
        <Video size={20} aria-hidden />
      </button>
    </>
  );
}
