"use client";

import { useCallback, useEffect, useState } from "react";

export interface MediaDeviceLists {
  mics: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

const EMPTY: MediaDeviceLists = { mics: [], cameras: [], speakers: [] };

/**
 * Takılı mikrofon / kamera / hoparlör listesi (docs/history/450-*). Etiketler izin verildikten sonra dolar (görüşmede ya da hazırlık
 * ekranında izin zaten alınmıştır). Aygıt takılıp çıkarılınca (`devicechange`) kendiliğinden tazelenir. Desteklenmiyorsa boş liste.
 */
export function useMediaDevices(enabled: boolean, rev = 0): MediaDeviceLists & { refresh: () => void } {
  const [lists, setLists] = useState<MediaDeviceLists>(EMPTY);

  const refresh = useCallback(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.enumerateDevices) return;
    md.enumerateDevices().then(
      (all) =>
        setLists({
          mics: all.filter((d) => d.kind === "audioinput"),
          cameras: all.filter((d) => d.kind === "videoinput"),
          speakers: all.filter((d) => d.kind === "audiooutput"),
        }),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const md = navigator.mediaDevices;
    md?.addEventListener?.("devicechange", refresh);
    return () => md?.removeEventListener?.("devicechange", refresh);
  }, [enabled, refresh, rev]);

  return { ...lists, refresh };
}

/** Çıkış cihazı seçimi (`setSinkId`) bu tarayıcıda var mı? (Safari/iOS'ta yok: hoparlör seçici gizlenir.) */
export function canPickSpeaker(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

/** Aygıt etiketi (izin öncesi boş gelir): "Mikrofon 2" gibi sıralı ad. */
export function deviceLabel(d: MediaDeviceInfo, index: number, fallback: string): string {
  return d.label || `${fallback} ${index + 1}`;
}
