"use client";

import Link from "next/link";
import { Settings, Sparkles } from "lucide-react";
import { ShareButton } from "@/features/prompts/share-button";
import { MessageButton } from "@/features/messages/message-button";
import { useBlockState } from "@/features/moderation/use-block-state";
import { FollowButtonView } from "./follow-button";
import { ProfileMoreMenu } from "./profile-more-menu";
import { useFollowState } from "./use-follow-state";
import { profileHref } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
import type { UserProfile } from "@/types";

/**
 * Own vs. other-profile actions are deliberately different components, not
 * one component branching internally — CLAUDE.md section 6: "kullanıcı
 * kendi profilinde kendini takip edememeli", so the two cases must never
 * accidentally share a follow button.
 */
export function OwnProfileActions({ user }: { user: UserProfile }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/profile/edit" className={buttonClassName({ size: "sm", variant: "outline", className: "h-9" })}>
        Profili Düzenle
      </Link>
      <Link
        href="/create"
        className={buttonClassName({ size: "sm", className: "h-9" })}
      >
        <Sparkles size={14} />
        Prompt Oluştur
      </Link>
      <ShareButton
        url={profileHref(user)}
        title="Promptly profilim"
        label="Paylaş"
        className="h-9 border border-border bg-surface px-3.5 text-text"
      />
      <Link
        href="/settings"
        title="Hesap ayarları"
        aria-label="Hesap ayarları"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
      >
        <Settings size={16} />
      </Link>
    </div>
  );
}

export function OtherProfileActions({
  user,
  followState,
}: {
  user: UserProfile;
  followState: ReturnType<typeof useFollowState>;
}) {
  const blockState = useBlockState(user);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FollowButtonView {...followState} size="md" />
      {blockState.isBlocked ? (
        <span className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm text-text-muted">
          Bu kullanıcıyı engelledin
        </span>
      ) : (
        <MessageButton user={user} />
      )}
      <ShareButton
        url={profileHref(user)}
        title="Promptly profili"
        label="Paylaş"
        className="h-9 border border-border bg-surface px-3.5 text-text"
      />
      <ProfileMoreMenu user={user} blockState={blockState} />
    </div>
  );
}
