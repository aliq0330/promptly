"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Pencil, Settings } from "lucide-react";
import { ShareButton } from "@/features/prompts/share-button";
import { MessageButton } from "@/features/messages/message-button";
import { useBlockState } from "@/features/moderation/use-block-state";
import { FollowButtonView } from "./follow-button";
import { ProfileMoreMenu } from "./profile-more-menu";
import { useFollowState } from "./use-follow-state";
import { cn, profileHref } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

const ICON_BUTTON_CLASS = "h-11 min-w-11 rounded-full border-0 bg-surface-soft px-3 text-text hover:bg-border-soft";
/** The one primary pill: fills the row on phones, its natural width beside the name from `sm`. */
const PRIMARY_CLASS = "h-11 flex-1 sm:flex-none sm:px-6";

/** The header's inline actions (docs/history/243-*): beside the name from `sm`, a full-width row under it on phones. */
function ProfileActionsRow({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("profile.actionsAria")} data-profile-actions="" className="flex w-full items-center gap-2 sm:w-auto">
      {children}
    </div>
  );
}

/**
 * Own vs. other-profile actions are deliberately different components, not
 * one component branching internally — CLAUDE.md section 6: "kullanıcı
 * kendi profilinde kendini takip edememeli", so the two cases must never
 * accidentally share a follow button. Both are the header's inline actions
 * (docs/history/243-*): one primary pill, then the rest.
 */
export function OwnProfileActions({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  return (
    <ProfileActionsRow>
      <Link href="/profile/edit" className={buttonClassName({ variant: "ghost", size: "md", className: cn(PRIMARY_CLASS, "bg-surface-soft text-text hover:bg-border-soft") })}>
        <Pencil size={16} aria-hidden />
        {t("profile.editProfileHeading")}
      </Link>
      <ShareButton url={profileHref(user)} title={t("profile.myProfileShareTitle")} className={ICON_BUTTON_CLASS} />
      <Link
        href="/settings"
        title={t("settings.pageTitle")}
        aria-label={t("settings.pageTitle")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text transition-colors hover:bg-border-soft"
      >
        <Settings size={18} />
      </Link>
    </ProfileActionsRow>
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
    <ProfileActionsRow>
      <FollowButtonView {...followState} size="md" className={PRIMARY_CLASS} />
      {blockState.isBlocked ? (
        <span className="inline-flex h-11 items-center rounded-full bg-surface-soft px-4 text-small text-text-muted">
          {t("profile.youBlockedThisUser")}
        </span>
      ) : (
        <MessageButton user={user} compact />
      )}
      <ShareButton url={profileHref(user)} title={t("profile.otherProfileShareTitle")} className={ICON_BUTTON_CLASS} />
      <ProfileMoreMenu user={user} blockState={blockState} triggerClassName="h-11 w-11 bg-surface-soft text-text hover:bg-border-soft" />
    </ProfileActionsRow>
  );
}
