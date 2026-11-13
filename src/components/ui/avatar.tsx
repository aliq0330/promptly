"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
  /**
   * Avatarın sağ alt köşesine oturan küçük rozet (ör. çevrimiçi noktası, docs/history/329-*). Avatar `overflow-hidden` olduğu için rozet dış
   * sarmalayıcıya çizilir; rozet yoksa DOM hiç değişmez. UI katmanı rozetin ne olduğunu bilmez.
   */
  badge?: ReactNode;
}

/** The avatar scale (audit §16): inline 20 · row 24 / 32 · list 40 · card 56 · profile 80. Pass one of these as `size`. */
export const AVATAR_SIZES = [20, 24, 32, 40, 56, 80] as const;

function initialsFromName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Avatar({ src, alt, size = 40, className, badge }: AvatarProps) {
  // A picture that fails to load (deleted file, offline, blocked host) falls
  // back to initials instead of showing the browser's broken-image + alt text.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const face = (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-medium text-primary ring-1 ring-border-soft",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {showImage && src ? (
        <Image src={src} alt={alt} fill sizes={`${size}px`} className="object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <span aria-hidden>{initialsFromName(alt)}</span>
      )}
    </span>
  );
  if (!badge) return face;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {face}
      {badge}
    </span>
  );
}
