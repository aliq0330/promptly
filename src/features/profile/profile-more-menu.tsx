"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, BellOff, BellRing, MoreVertical } from "lucide-react";
import { ReportButton } from "@/features/moderation/report-button";
import { useBlockState } from "@/features/moderation/use-block-state";
import { useMuteToggle } from "@/features/notifications/mute-store";
import { announceNotice } from "@/lib/app-notice";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

/**
 * Another user's profile "..." menu — block/unblock (real, permanent,
 * Bölüm 21 Faz B) and report. Renders nothing while signed out (mirrors
 * `MessageButton`'s own-profile-only visibility rules — there's simply
 * nothing here a visitor without an account can do).
 */
export function ProfileMoreMenu({
  user,
  blockState,
  extraItems,
  triggerClassName,
}: {
  user: UserProfile;
  blockState: ReturnType<typeof useBlockState>;
  /** Extra leading menu items (the chat actions in a conversation header); receives `close` to dismiss the menu after a choice. */
  extraItems?: (close: () => void) => React.ReactNode;
  /** Extra classes for the "⋮" button (the profile's soft round button, docs/history/272-*). */
  triggerClassName?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Bildirimleri sessize al / sesi aç (docs/history/327-*): kişiyi engellemeden yalnız bildirimlerini keser; durum bildirim merkeziyle ortaktır.
  const mute = useMuteToggle("actor", blockState.canBlock ? user.id : null, user.displayName);

  async function handleMuteClick() {
    setOpen(false);
    setConfirmingBlock(false);
    try {
      const nowMuted = await mute.toggle();
      announceNotice(t(nowMuted ? "nc.mutedPerson" : "nc.unmutedPerson", { name: user.displayName }));
    } catch (err) {
      console.error("profile mute", err);
      announceNotice(t("nc.actionFailed"));
    }
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setConfirmingBlock(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmingBlock(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!blockState.canBlock) return null;

  async function handleBlockClick() {
    if (!blockState.isBlocked && !confirmingBlock) {
      setConfirmingBlock(true);
      return;
    }
    setConfirmingBlock(false);
    await blockState.toggle();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("profile.profileOptionsAriaLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text", triggerClassName)}
      >
        <MoreVertical size={18} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-64 space-y-3 rounded-md border border-border-soft bg-surface-elevated p-3 shadow-pop animate-pop-in"
        >
          {extraItems && (
            <div className="space-y-0.5 border-b border-border pb-3">
              {extraItems(() => {
                setOpen(false);
                setConfirmingBlock(false);
              })}
            </div>
          )}
          <button type="button" role="menuitem" onClick={() => void handleMuteClick()} disabled={!mute.loaded} data-action={mute.muted ? "profile-unmute" : "profile-mute"} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-surface-soft disabled:opacity-60">
            {mute.muted ? <BellRing size={14} aria-hidden /> : <BellOff size={14} aria-hidden />}
            <span className="min-w-0">
              <span className="block">{mute.muted ? t("nc.profile.unmute") : t("nc.profile.mute")}</span>
              <span className="block text-caption text-text-muted">{mute.muted ? t("nc.profile.unmuteHint") : t("nc.profile.muteHint")}</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleBlockClick}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-soft",
              blockState.isBlocked ? "text-text" : "text-danger",
            )}
          >
            <Ban size={14} />
            {blockState.isBlocked ? t("profile.unblock") : confirmingBlock ? t("common.confirmDelete") : t("profile.block")}
          </button>
          <div className="border-t border-border pt-3">
            <ReportButton targetType="user" targetId={user.id} label={t("profile.reportThisUser")} />
          </div>
        </div>
      )}
    </div>
  );
}
