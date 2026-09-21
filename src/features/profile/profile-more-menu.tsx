"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, MoreVertical } from "lucide-react";
import { ReportButton } from "@/features/moderation/report-button";
import { useBlockState } from "@/features/moderation/use-block-state";
import { cn } from "@/lib/utils";
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
}: {
  user: UserProfile;
  blockState: ReturnType<typeof useBlockState>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        aria-label="Profil seçenekleri"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-transparent text-text-muted transition-colors hover:bg-accent-surface hover:text-text"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-30 w-64 space-y-3 rounded-md border border-border bg-surface p-3 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleBlockClick}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent-surface",
              blockState.isBlocked ? "text-text" : "text-red-600",
            )}
          >
            <Ban size={14} />
            {blockState.isBlocked ? "Engeli kaldır" : confirmingBlock ? "Emin misin? Tekrar tıkla" : "Engelle"}
          </button>
          <div className="border-t border-border pt-3">
            <ReportButton targetType="user" targetId={user.id} label="Bu kullanıcıyı şikayet et" />
          </div>
        </div>
      )}
    </div>
  );
}
