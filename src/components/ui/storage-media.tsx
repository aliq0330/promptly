"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps, type RefObject, type SyntheticEvent } from "react";
import Image from "next/image";
import { getCachedMediaUrl, isProtectedMediaUrl, resolveMediaUrl } from "@/lib/supabase/media-url";

const RETRY_COOLDOWN_MS = 15 * 1000;

/**
 * Gönderi medyasını (prompt-media / request-references / result-media — private
 * bucket'lar) gösteren tek yol. Bileşenlere veritabanındaki kimlik URL'si
 * verilir; burada kısa ömürlü signed URL'ye çevrilir. Süresi dolan bir imza
 * yüklenemezse (`onError`) bir kez yeniden imzalanır. data:/harici/avatar gibi
 * korumasız URL'ler olduğu gibi geçer, yani her `src` için güvenle kullanılır.
 */
export function useStorageSrc(url: string | null | undefined): { src: string | undefined; refresh: () => void } {
  const needsSigning = isProtectedMediaUrl(url);
  const [resolved, setResolved] = useState<{ url: string; src: string | null } | null>(null);
  const lastRetry = useRef(0);

  useEffect(() => {
    if (!url || !needsSigning) return;
    let alive = true;
    resolveMediaUrl(url).then((signed) => {
      if (alive) setResolved({ url, src: signed });
    });
    return () => {
      alive = false;
    };
  }, [url, needsSigning]);

  const refresh = useCallback(() => {
    // Aynı hata olayı arka arkaya gelirse (ya da dosya gerçekten okunamıyorsa) imza istekleri döngüye girmesin.
    if (!url || !needsSigning || Date.now() - lastRetry.current < RETRY_COOLDOWN_MS) return;
    lastRetry.current = Date.now();
    resolveMediaUrl(url, { force: true }).then((signed) => setResolved({ url, src: signed }));
  }, [url, needsSigning]);

  if (!url) return { src: undefined, refresh };
  if (!needsSigning) return { src: url, refresh };
  if (resolved?.url === url) return { src: resolved.src ?? undefined, refresh };
  return { src: getCachedMediaUrl(url) ?? undefined, refresh };
}

type StorageSrc = string | null | undefined;

/** `<img>` yerine; `src` çözülene (ya da çözülemezse hiçbir zaman) kadar hiçbir şey çizmez. */
export function StorageImg({ src: url, alt = "", onError, ...rest }: Omit<ComponentProps<"img">, "src"> & { src: StorageSrc }) {
  const { src, refresh } = useStorageSrc(url);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- user media of any origin; sizing is handled by the caller's classes
    <img
      {...rest}
      src={src}
      alt={alt}
      onError={(event) => {
        refresh();
        onError?.(event);
      }}
    />
  );
}

/** `next/image` yerine (`fill` vb. aynen geçer). */
export function StorageImage({ src: url, alt, onError, ...rest }: Omit<ComponentProps<typeof Image>, "src"> & { src: StorageSrc }) {
  const { src, refresh } = useStorageSrc(url);
  if (!src) return null;
  return (
    <Image
      {...rest}
      src={src}
      alt={alt}
      onError={(event) => {
        refresh();
        onError?.(event);
      }}
    />
  );
}

/** CSS `background-image` ile gösterilen küçük kapaklar için; `url` yoksa/çözülemezse `fallback` (yoksa düz zemin). */
export function StorageBackground({
  url,
  fallback,
  as: Tag = "div",
  className,
}: {
  url: StorageSrc;
  fallback?: string;
  as?: "div" | "span";
  className?: string;
}) {
  const { src } = useStorageSrc(url);
  const image = src ?? (url ? undefined : fallback);
  return <Tag className={className} style={image ? { backgroundImage: `url("${image}")` } : undefined} />;
}

/**
 * Video/ses oynatıcısı: oynatma sırasında `src`'yi proaktif değiştirmez (oynatmayı
 * kesmesin diye); imza süresi dolup yükleme/arama hata verirse yeniden imzalar ve
 * kaldığı yerden devam eder.
 */
function useResumableMedia<T extends HTMLVideoElement | HTMLAudioElement>(refresh: () => void) {
  const ref = useRef<T>(null);
  const resumeAt = useRef<{ time: number; playing: boolean } | null>(null);

  const handleError = useCallback(() => {
    const element = ref.current;
    if (element) resumeAt.current = { time: element.currentTime, playing: !element.paused };
    refresh();
  }, [refresh]);

  const handleLoadedMetadata = useCallback(() => {
    const element = ref.current;
    const resume = resumeAt.current;
    if (!element || !resume) return;
    resumeAt.current = null;
    element.currentTime = resume.time;
    if (resume.playing) void element.play().catch(() => undefined);
  }, []);

  return { ref, handleError, handleLoadedMetadata };
}

export function StorageVideo({
  src: url,
  poster: posterUrl,
  onError,
  onLoadedMetadata,
  ref: externalRef,
  ...rest
}: Omit<ComponentProps<"video">, "src" | "poster" | "ref"> & { src: StorageSrc; poster?: StorageSrc; ref?: RefObject<HTMLVideoElement | null> }) {
  const { src, refresh } = useStorageSrc(url);
  const { src: poster } = useStorageSrc(posterUrl);
  const { ref, handleError, handleLoadedMetadata } = useResumableMedia<HTMLVideoElement>(refresh);
  // Çağıran da oynatıcıyı yönetebilsin (hikâye görüntüleyicisi duraklatır/oynatır): iç ve dış ref aynı öğeyi gösterir.
  const setRefs = useCallback(
    (element: HTMLVideoElement | null) => {
      ref.current = element;
      if (externalRef) externalRef.current = element;
    },
    [ref, externalRef],
  );
  if (!src) return null;
  return (
    <video
      {...rest}
      ref={setRefs}
      src={src}
      poster={poster}
      onError={(event: SyntheticEvent<HTMLVideoElement>) => {
        handleError();
        onError?.(event);
      }}
      onLoadedMetadata={(event) => {
        handleLoadedMetadata();
        onLoadedMetadata?.(event);
      }}
    />
  );
}

export function StorageAudio({
  src: url,
  onError,
  onLoadedMetadata,
  ...rest
}: Omit<ComponentProps<"audio">, "src"> & { src: StorageSrc }) {
  const { src, refresh } = useStorageSrc(url);
  const { ref, handleError, handleLoadedMetadata } = useResumableMedia<HTMLAudioElement>(refresh);
  if (!src) return null;
  return (
    <audio
      {...rest}
      ref={ref}
      src={src}
      onError={(event) => {
        handleError();
        onError?.(event);
      }}
      onLoadedMetadata={(event) => {
        handleLoadedMetadata();
        onLoadedMetadata?.(event);
      }}
    />
  );
}
