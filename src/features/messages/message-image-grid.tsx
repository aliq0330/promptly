"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ImageOff, Loader2, RotateCw } from "lucide-react";
import { getCachedSignedUrl, resolveSignedUrls } from "@/lib/supabase/message-images";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { MessageAttachment } from "@/types";

/** One thing to draw in the grid — either a stored attachment (resolved to a signed URL) or a local, not-yet-uploaded preview. */
export interface GridImage {
  key: string;
  url: string | null;
  width: number | null;
  height: number | null;
}

/** Signed URLs for a message's stored photos — resolved in one batched request, served from a module cache afterwards (no flash on re-render). */
export function useMessageImageUrls(attachments: MessageAttachment[]): Map<string, string> {
  const paths = attachments.map((a) => a.path);
  const pathKey = paths.join("|");
  const [urls, setUrls] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const path of paths) {
      const hit = getCachedSignedUrl(path);
      if (hit) initial.set(path, hit);
    }
    return initial;
  });

  useEffect(() => {
    if (paths.length === 0) return;
    let cancelled = false;
    resolveSignedUrls(paths).then((resolved) => {
      if (!cancelled && resolved.size > 0) setUrls((prev) => new Map([...prev, ...resolved]));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pathKey` stands in for the array contents
  }, [pathKey]);

  return urls;
}

function Cell({
  image,
  className,
  index,
  total,
  onOpen,
  aspect,
}: {
  image: GridImage;
  className?: string;
  index: number;
  total: number;
  onOpen: (index: number) => void;
  /** Natural aspect ratio — used only for a lone image (everything else is a square crop). */
  aspect?: number;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const label = t("messages.photoOfTotal", { index: index + 1, total });

  return (
    <button
      type="button"
      onClick={(event) => {
        // Opening the viewer must not toggle the bubble's tap-to-reveal action icons.
        event.stopPropagation();
        if (image.url && !failed) onOpen(index);
      }}
      aria-label={t("messages.openPhotoAria", { index: index + 1, total })}
      style={aspect ? { aspectRatio: String(aspect) } : undefined}
      className={cn(
        "relative block overflow-hidden bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        !aspect && "aspect-square",
        className,
      )}
    >
      {image.url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or a local blob preview
        <img
          src={image.url}
          alt={label}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-text-muted">
          {failed ? <ImageOff size={20} aria-hidden /> : <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />}
        </span>
      )}
    </button>
  );
}

/**
 * Photos inside a message bubble. 1 → a single image keeping its aspect
 * ratio; 2 → side by side; 3 → two on top, one wide below; 4+ → a 2×2
 * gallery with a "+N" overlay on the last visible tile. The grid never
 * draws an overlay of its own state (uploading/failed) — `overlay` is an
 * opt-in layer the optimistic bubble uses.
 */
export function MessageImageGrid({
  images,
  onOpen,
  overlay,
  className,
}: {
  images: GridImage[];
  onOpen: (index: number) => void;
  overlay?: React.ReactNode;
  className?: string;
}) {
  const total = images.length;
  if (total === 0) return null;

  let body: React.ReactNode;
  if (total === 1) {
    const [only] = images;
    const ratio = only.width && only.height ? Math.min(Math.max(only.width / only.height, 0.6), 1.8) : 1;
    body = <Cell image={only} index={0} total={1} onOpen={onOpen} aspect={ratio} className="w-full rounded-xl" />;
  } else if (total === 2) {
    body = (
      <div className="grid grid-cols-2 gap-1">
        {images.map((image, i) => (
          <Cell key={image.key} image={image} index={i} total={total} onOpen={onOpen} className="rounded-xl" />
        ))}
      </div>
    );
  } else if (total === 3) {
    body = (
      <div className="grid grid-cols-2 gap-1">
        <Cell image={images[0]} index={0} total={total} onOpen={onOpen} className="rounded-xl" />
        <Cell image={images[1]} index={1} total={total} onOpen={onOpen} className="rounded-xl" />
        <Cell image={images[2]} index={2} total={total} onOpen={onOpen} className="col-span-2 aspect-[2/1] rounded-xl" />
      </div>
    );
  } else {
    const shown = images.slice(0, 4);
    const extra = total - 4;
    body = (
      <div className="grid grid-cols-2 gap-1">
        {shown.map((image, i) => (
          <div key={image.key} className="relative">
            <Cell image={image} index={i} total={total} onOpen={onOpen} className="rounded-xl" />
            {i === 3 && extra > 0 && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 text-lg font-semibold text-white">
                +{extra}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("relative w-[min(17rem,100%)] sm:w-[min(20rem,100%)]", className)}>
      {body}
      {overlay}
    </div>
  );
}

/** The dimmed "uploading" / "failed — try again" layer drawn over an optimistic bubble's photos. */
export function SendStateOverlay({
  status,
  onRetry,
}: {
  status: "sending" | "failed";
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  if (status === "sending") {
    return (
      <span
        role="status"
        aria-label={t("messages.uploadingPhotos")}
        className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/55 backdrop-blur-[1px]"
      >
        <Loader2 size={26} className="animate-spin text-text motion-reduce:animate-none" aria-hidden />
      </span>
    );
  }
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-background/75 p-2 text-center">
      <AlertTriangle size={20} className="text-danger" aria-hidden />
      {onRetry && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          className="inline-flex items-center gap-1 rounded-full bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          <RotateCw size={12} aria-hidden />
          {t("common.retry")}
        </button>
      )}
    </span>
  );
}
