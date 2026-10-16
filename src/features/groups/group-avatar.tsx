"use client";

import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useStorageSrc } from "@/components/ui/storage-media";
import { cn } from "@/lib/utils";

/** Grup görseli (özel bucket → signed URL); görsel yoksa ya da yüklenemezse adın baş harfleri. `badge`: köşede küçük "grup" işareti (listelerde birebir sohbetten ayırt etmek için). */
export function GroupAvatar({
  name,
  avatarUrl,
  size = 40,
  badge = false,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  badge?: boolean;
  className?: string;
}) {
  // Topluluk görseli özel bucket'tadır (docs/history/177-*): DB'deki URL kimliktir, gösterirken kısa ömürlü signed URL'ye çevrilir.
  // Eski ortak `avatars` bucket'ındaki görseller olduğu gibi geçer. İmza alınamazsa (kart görülemiyor) baş harfler gösterilir.
  const { src } = useStorageSrc(avatarUrl);
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar src={src ?? null} alt={name} size={size} />
      {badge && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-foreground"
          style={{ width: Math.max(16, size * 0.4), height: Math.max(16, size * 0.4) }}
        >
          <Users size={Math.max(9, size * 0.22)} strokeWidth={2.25} />
        </span>
      )}
    </span>
  );
}
