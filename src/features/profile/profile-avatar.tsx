"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";

export function ProfileAvatar({
  src,
  alt,
  isOwnProfile,
  size = 88,
}: {
  src: string | null;
  alt: string;
  isOwnProfile: boolean;
  size?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative inline-flex">
      <Avatar src={src} alt={alt} size={size} className="text-2xl" />
      {isOwnProfile && (
        <Link
          href="/profile/edit"
          aria-label={t("profile.changeProfilePhoto")}
          title={t("profile.changeProfilePhoto")}
          className="absolute bottom-1 right-1 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-foreground transition-colors hover:bg-primary-dark"
        >
          <Pencil size={13} />
        </Link>
      )}
    </div>
  );
}
