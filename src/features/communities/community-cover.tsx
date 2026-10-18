"use client";

import Image from "next/image";
import { useStorageSrc } from "@/components/ui/storage-media";
import { normalizeCoverColor } from "@/lib/communities";
import { cn } from "@/lib/utils";

/**
 * A community's cover band (Meydan, docs/history/191-*). Priority: the cover PHOTO (private bucket, signed URL) › the chosen
 * COLOUR › automatic — the community's own picture, enlarged and blurred, so a community that set nothing still gets a band
 * that matches its profile picture; with no picture either, a quiet brand tint. Decorative only (no text sits on it).
 */
export function CommunityCover({
  coverUrl,
  coverColor,
  avatarUrl,
  className,
}: {
  coverUrl: string | null;
  coverColor: string | null;
  avatarUrl: string | null;
  className?: string;
}) {
  const photo = useStorageSrc(coverUrl);
  const avatar = useStorageSrc(coverUrl ? null : avatarUrl);
  const color = normalizeCoverColor(coverColor);
  const showColor = !coverUrl && color;
  return (
    <div
      aria-hidden
      data-community-cover={coverUrl ? "photo" : color ? "color" : "auto"}
      className={cn("relative h-24 overflow-hidden bg-primary-soft sm:h-32", className)}
      // The colour is the community's own choice (user content, stored as #rrggbb), not a design token.
      style={showColor ? { backgroundColor: color } : undefined}
    >
      {coverUrl && photo.src && <Image src={photo.src} alt="" fill sizes="100vw" priority className="object-cover" />}
      {!coverUrl && !color && avatar.src && <Image src={avatar.src} alt="" fill sizes="100vw" className="scale-125 object-cover opacity-80 blur-2xl" />}
    </div>
  );
}
