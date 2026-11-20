"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { CallController, CallSnapshot } from "@/lib/webrtc/call-controller";
import { elapsedSeconds } from "@/lib/webrtc/call-rules";

const noopSubscribe = () => () => {};
const nullSnapshot = (): CallSnapshot | null => null;

/**
 * Çalışan bir aramanın (docs/history/449-*) arayüz kancası. Yaşam döngüsü `CallController`'dadır (React dışında, Strict Mode'a dayanıklı);
 * bu kanca onu `useSyncExternalStore` ile okur ve eylemleri sarar. Denetleyici yoksa (`null`) anlık görüntü de `null`dır.
 */
export function useWebRTCCall(controller: CallController | null) {
  const snapshot = useSyncExternalStore(controller ? controller.subscribe : noopSubscribe, controller ? controller.getSnapshot : nullSnapshot, nullSnapshot);
  const connectedAt = snapshot?.connectedAt ?? null;
  const [now, setNow] = useState(() => Date.now());

  // Süre sayacı yalnız bağlıyken saniyede bir güncellenir; anlık görüntü her saniye değişmez.
  useEffect(() => {
    if (connectedAt === null || snapshot?.phase !== "connected") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connectedAt, snapshot?.phase]);

  const hangup = useCallback(() => controller?.hangup(), [controller]);
  const toggleMic = useCallback(() => controller?.toggleMic(), [controller]);
  const toggleCamera = useCallback(() => controller?.toggleCamera(), [controller]);

  return { snapshot, seconds: elapsedSeconds(connectedAt, now), hangup, toggleMic, toggleCamera };
}
