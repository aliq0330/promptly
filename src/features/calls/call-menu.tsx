"use client";

import { useEffect, useRef } from "react";
import { MENU_ITEM_CLASS, MENU_PANEL_CLASS } from "@/components/ui/menu";
import { RefreshCw } from "@/components/icons/refresh-cw";
import { Shuffle } from "@/components/icons/shuffle";
import { Check } from "@/components/icons/check";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { canPickSpeaker, deviceLabel, useMediaDevices } from "./use-media-devices";

/**
 * Görüşme ⋯ menüsü (docs/history/450-*): mikrofon / hoparlör / kamera seçimi, kamerayı çevir (telefon), görüntüleri yer değiştir.
 * Seçim hemen uygulanır (`onPick*`) ve cihaz tercihi olarak saklanır. Dışarı tıklama / Esc kapatır.
 */
export function CallMenu({
  video,
  rev,
  activeMic,
  activeCamera,
  activeSpeaker,
  onPickMic,
  onPickCamera,
  onPickSpeaker,
  onFlip,
  onSwap,
  onClose,
  className,
}: {
  video: boolean;
  rev: number;
  activeMic: string | null;
  activeCamera: string | null;
  activeSpeaker: string | null;
  onPickMic: (id: string) => void;
  onPickCamera: (id: string) => void;
  onPickSpeaker: (id: string) => void;
  onFlip: () => void;
  onSwap: () => void;
  onClose: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { mics, cameras, speakers } = useMediaDevices(true, rev);
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest("[data-call-more]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const group = (title: string, list: MediaDeviceInfo[], active: string | null, pick: (id: string) => void, fallback: string) =>
    list.length > 0 && (
      <div role="group" aria-label={title}>
        <p className="px-3 pb-0.5 pt-2 text-caption font-semibold text-text-muted">{title}</p>
        {list.map((device, index) => {
          const selected = active ? device.deviceId === active : index === 0;
          return (
            <button
              key={device.deviceId || index}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => pick(device.deviceId)}
              className={cn(MENU_ITEM_CLASS, "justify-between", selected && "bg-primary-soft text-primary-text")}
            >
              <span className="min-w-0 flex-1 truncate">{deviceLabel(device, index, fallback)}</span>
              {selected && <Check size={16} aria-hidden />}
            </button>
          );
        })}
      </div>
    );

  return (
    <div ref={ref} role="menu" data-call-menu aria-label={t("calls.menu.aria")} className={cn(MENU_PANEL_CLASS, "max-h-[60dvh] w-80 max-w-[calc(100%-2rem)] overflow-y-auto", className)}>
      {video && (cameras.length > 1 || coarse) && (
        <button type="button" role="menuitem" data-call-flip onClick={onFlip} className={MENU_ITEM_CLASS}>
          <RefreshCw size={20} aria-hidden /> {t("calls.menu.flip")}
        </button>
      )}
      {video && (
        <button type="button" role="menuitem" data-call-swap onClick={onSwap} className={MENU_ITEM_CLASS}>
          <Shuffle size={20} aria-hidden /> {t("calls.menu.swap")}
        </button>
      )}
      {group(t("calls.menu.mic"), mics, activeMic, onPickMic, t("calls.menu.micFallback"))}
      {canPickSpeaker() && group(t("calls.menu.speaker"), speakers, activeSpeaker, onPickSpeaker, t("calls.menu.speakerFallback"))}
      {video && group(t("calls.menu.camera"), cameras, activeCamera, onPickCamera, t("calls.menu.cameraFallback"))}
    </div>
  );
}
