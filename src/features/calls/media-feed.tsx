"use client";

import { useEffect, useRef } from "react";
import { VideoOff } from "@/components/icons/video-off";
import { cn } from "@/lib/utils";

/**
 * Görüntü akışı (docs/history/450-*): `<video>` her zaman SESSİZDİR (`muted`); uzak ses ayrı, görüşme boyunca yaşayan `RemoteAudio`'dan
 * çalar. Böylece küçültme / yer değiştirme (video öğeleri yeniden kurulur) sesi hiç kesmez. `srcObject` yalnız bağlanır (kaydedilmez /
 * yüklenmez) ve öğe kalkarken temizlenir. `off` = kamera kapalı yer tutucusu.
 */
export function VideoFeed({
  stream,
  mirrored,
  label,
  off,
  offLabel,
  className,
  dataAttr,
}: {
  stream: MediaStream | null;
  mirrored?: boolean;
  label?: string;
  off?: boolean;
  offLabel: string;
  className?: string;
  /** Test/erişim için işaret (`data-remote-video` gibi). */
  dataAttr?: Record<string, string>;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
    return () => {
      el.srcObject = null;
    };
  }, [stream]);
  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-call-stage", className)}>
      <video ref={ref} autoPlay playsInline muted {...dataAttr} className={cn("h-full w-full object-cover", mirrored && "-scale-x-100", off && "invisible")} />
      {off && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-call-stage text-small text-on-art-muted">
          <VideoOff size={24} aria-hidden />
          {offLabel}
        </span>
      )}
      {label && <span className="absolute bottom-2 left-2 rounded-full bg-art-chip px-2.5 py-0.5 text-caption font-semibold text-on-art">{label}</span>}
    </div>
  );
}

/**
 * Uzak ses (gizli `<audio>`): görüşme süresince TEK öğe. Hoparlör seçimi `setSinkId` ile (destekleyen tarayıcıda). Tarayıcı oynatmayı
 * engellerse (autoplay) `onBlocked(true)` bildirilir; kullanıcı dokununca `resumeRef.current()` ile başlatılır.
 */
export function RemoteAudio({ stream, sinkId, onBlocked, resumeRef }: { stream: MediaStream | null; sinkId: string | null; onBlocked: (blocked: boolean) => void; resumeRef: React.MutableRefObject<() => void> }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    const start = () => {
      if (!stream) return;
      el.play().then(
        () => onBlocked(false),
        () => onBlocked(true),
      );
    };
    resumeRef.current = start;
    start();
    return () => {
      el.srcObject = null;
    };
  }, [stream, onBlocked, resumeRef]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId && sinkId) void el.setSinkId(sinkId).catch(() => undefined);
  }, [sinkId, stream]);
  return <audio ref={ref} autoPlay data-remote-audio className="hidden" />;
}
