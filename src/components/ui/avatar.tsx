"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}

function initialsFromName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Avatar({ src, alt, size = 40, className }: AvatarProps) {
  // A picture that fails to load (deleted file, offline, blocked host) falls
  // back to initials instead of showing the browser's broken-image + alt text.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  return (
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
}
