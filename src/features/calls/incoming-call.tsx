"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Phone } from "@/components/icons/phone";
import { PhoneOff } from "@/components/icons/phone-off";
import { Video } from "@/components/icons/video";
import { useTranslation } from "@/lib/i18n/language-provider";
import { startRingtone } from "@/lib/webrtc/ringtone";
import type { CallPeerInfo, CallType } from "@/lib/webrtc/types";

/**
 * Gelen arama kartı (docs/history/449-*): avatar, ad, arama türü, Reddet / Kabul et. Çalma sesi Web Audio ile üretilir (tarayıcı etkileşimsiz
 * sesi engellerse sessiz kalır, kart yine görünür). Esc = reddet. Kabul/red `busy` iken kilitlenir (çift tıklama tek istek).
 */
export function IncomingCall({
  peer,
  type,
  busy,
  ring = true,
  onAccept,
  onReject,
}: {
  peer: CallPeerInfo;
  type: CallType;
  busy: boolean;
  /** Zil sesi çalsın mı (cihaz tercihi, rahatsız etme saatleri ve "Görünmez" durumuna göre sağlayıcı karar verir). */
  ring?: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const name = peer.displayName || peer.username || t("calls.incoming.title");

  useEffect(() => {
    lockBodyScroll();
    rootRef.current?.focus();
    const stop = ring ? startRingtone("incoming") : () => {};
    return () => {
      stop();
      unlockBodyScroll();
    };
  }, [ring]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onReject();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onReject]);

  return (
    <div className="fixed inset-0 z-(--z-celebration) flex items-center justify-center bg-scrim p-4 animate-fade-in" data-incoming-call-layer>
      <div
        ref={rootRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-label={t("calls.incoming.aria", { name })}
        data-incoming-call
        data-call-type={type}
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl bg-surface px-6 py-8 text-center shadow-pop outline-none focus-visible:ring-2 focus-visible:ring-focus animate-pop-in"
      >
        <p className="text-label font-semibold text-text-muted">{t("calls.incoming.title")}</p>
        <Avatar src={peer.avatarUrl} alt="" size={96} />
        <div className="min-w-0 max-w-full">
          <h2 className="truncate font-display text-h2 text-text">{name}</h2>
          {peer.username && peer.displayName ? <p className="truncate text-small text-text-muted">@{peer.username}</p> : null}
        </div>
        <p className="inline-flex items-center gap-2 text-body text-text-secondary" role="status">
          {type === "video" ? <Video size={20} aria-hidden /> : <Phone size={20} aria-hidden />}
          {type === "video" ? t("calls.incoming.video") : t("calls.incoming.voice")}
        </p>
        <div className="mt-2 flex w-full items-center justify-center gap-4">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            data-incoming-reject
            className="inline-flex h-12 min-w-32 flex-1 items-center justify-center gap-2 rounded-sm bg-danger px-5 text-body font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
          >
            <PhoneOff size={20} aria-hidden /> {t("calls.incoming.reject")}
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            data-incoming-accept
            className="inline-flex h-12 min-w-32 flex-1 items-center justify-center gap-2 rounded-sm bg-success px-5 text-body font-semibold text-success-foreground transition-colors hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
          >
            {type === "video" ? <Video size={20} aria-hidden /> : <Phone size={20} aria-hidden />} {t("calls.incoming.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
