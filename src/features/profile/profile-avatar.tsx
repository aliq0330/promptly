"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";

export function ProfileAvatar({
  src,
  alt,
  isOwnProfile,
}: {
  src: string | null;
  alt: string;
  isOwnProfile: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative inline-flex">
      <Avatar src={src} alt={alt} size={88} className="text-2xl" />
      {isOwnProfile && (
        <Link
          href="/profile/edit"
          aria-label={t("profile.changeProfilePhoto")}
          title={t("profile.changeProfilePhoto")}
          className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-foreground transition-colors hover:bg-primary-dark"
        >
          <Pencil size={13} />
        </Link>
      )}
    </div>
  );
}
