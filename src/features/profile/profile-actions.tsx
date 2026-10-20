"use client";

import Link from "next/link";
import { Pencil, Settings } from "lucide-react";
import { ShareButton } from "@/features/prompts/share-button";
import { MessageButton } from "@/features/messages/message-button";
import { useBlockState } from "@/features/moderation/use-block-state";
import { BAND_PRIMARY_CLASS, BandActionRow } from "@/features/content/detail-parts";
import { FollowButtonView } from "./follow-button";
import { ProfileMoreMenu } from "./profile-more-menu";
import { useFollowState } from "./use-follow-state";
import { profileHref } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

const ICON_BUTTON_CLASS = "h-11 min-w-11 rounded-full px-3";

/**
 * Own vs. other-profile actions are deliberately different components, not
 * one component branching internally — CLAUDE.md section 6: "kullanıcı
 * kendi profilinde kendini takip edememeli", so the two cases must never
 * accidentally share a follow button. Both are the Albüm actions row under
 * the band (docs/history/203-*): one big primary pill, then the rest.
 */
export function OwnProfileActions({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  return (
    <BandActionRow label={t("profile.actionsAria")} data-profile-actions="">
      <Link href="/profile/edit" className={buttonClassName({ size: "lg", className: BAND_PRIMARY_CLASS })}>
        <Pencil size={18} aria-hidden />
        {t("profile.editProfileHeading")}
      </Link>
      <ShareButton url={profileHref(user)} title={t("profile.myProfileShareTitle")} className={ICON_BUTTON_CLASS} />
      <Link
        href="/settings"
        title={t("settings.pageTitle")}
        aria-label={t("settings.pageTitle")}
        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
      >
        <Settings size={18} />
      </Link>
    </BandActionRow>
  );
}

export function OtherProfileActions({
  user,
  followState,
}: {
  user: UserProfile;
  followState: ReturnType<typeof useFollowState>;
}) {
  const { t } = useTranslation();
  const blockState = useBlockState(user);

  return (
    <BandActionRow label={t("profile.actionsAria")} data-profile-actions="">
      <FollowButtonView {...followState} size="md" className={BAND_PRIMARY_CLASS} />
      {blockState.isBlocked ? (
        <span className="inline-flex h-12 items-center rounded-full border border-border px-5 text-small text-text-muted">
          {t("profile.youBlockedThisUser")}
        </span>
      ) : (
        <MessageButton user={user} />
      )}
      <ShareButton url={profileHref(user)} title={t("profile.otherProfileShareTitle")} className={ICON_BUTTON_CLASS} />
      <div className="ml-auto">
        <ProfileMoreMenu user={user} blockState={blockState} />
      </div>
    </BandActionRow>
  );
}
