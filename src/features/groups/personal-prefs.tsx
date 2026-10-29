"use client";

import { useState } from "react";
import { BellOff, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaveCommunityDialog } from "./leave-community-dialog";
import { useAsyncAction } from "./use-async-action";
import { setChatGroupMuted } from "@/lib/supabase/chat-groups";
import { leaveOutcome } from "@/lib/chat-groups";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { ChatGroup } from "@/types";

/** Kişisel sessize alma eylemi (anahtar da karo da aynı yolu kullanır): kendi `conversation_members.muted_at` satırını değiştirir. */
export function useChatMute({
  groupId,
  mutedAt,
  onMutedChange,
  onToast,
}: {
  groupId: string;
  mutedAt: string | null;
  onMutedChange: (mutedAt: string | null) => void;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const mute = useAsyncAction();
  const muted = Boolean(mutedAt);

  async function toggle() {
    if (!user) return;
    const next = await mute.run(() => setChatGroupMuted(groupId, user.id, !muted));
    if (next === undefined) return;
    onMutedChange(next);
    onToast(next ? t("groups.about.mutedToast") : t("groups.about.unmutedToast"));
  }

  return { muted, busy: mute.busy, error: mute.error, toggle };
}

/**
 * Sohbeti sessize alma (KİŞİYE ÖZEL: yalnız kendi `conversation_members.muted_at` satırı). Hem sohbet bilgi penceresi hem de topluluk
 * "Hakkında" sekmesi bu tek bileşeni kullanır; sunucudaki karşılığı `setChatGroupMuted` (başkasının tercihine dokunamaz).
 */
export function ChatMuteToggle({
  groupId,
  mutedAt,
  onMutedChange,
  onToast,
}: {
  groupId: string;
  mutedAt: string | null;
  onMutedChange: (mutedAt: string | null) => void;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const mute = useChatMute({ groupId, mutedAt, onMutedChange, onToast });
  const { muted, toggle } = mute;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={muted}
        onClick={() => void toggle()}
        disabled={mute.busy}
        className="flex w-full items-center gap-3 rounded-lg border border-border-soft px-3 py-3 text-left transition-colors hover:border-border-strong hover:bg-surface-soft disabled:opacity-60"
      >
        <BellOff size={18} className="shrink-0 text-text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text">{t("groups.about.muteLabel")}</span>
          <span className="block text-caption text-text-muted">{t("groups.about.muteHelp")}</span>
        </span>
        <span aria-hidden className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", muted ? "bg-primary" : "bg-border-strong")}>
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-xs transition-all", muted ? "left-[1.125rem]" : "left-0.5")} />
        </span>
      </button>
      {mute.error && (
        <p role="alert" className="text-caption text-danger">
          {mute.error}
        </p>
      )}
    </div>
  );
}

/**
 * "Topluluktan ayrıl" bölümü: işlemin sonucunu (sohbetten de çıkarılırsın; sahip önce devretmeli; tek üye ise topluluk silinir) önceden
 * yazar. Üyelik tek satır olduğundan "yalnız sohbetten ayrıl" diye ayrı bir işlem YOKTUR — onun yerine sessize alma / listeden kaldırma var.
 */
export function LeaveCommunitySection({
  group,
  onLeft,
  onGoToMembers,
  compact = false,
}: {
  group: ChatGroup;
  onLeft: () => void;
  onGoToMembers: () => void;
  /** Sohbet bilgi sayfasında: kart içinde tek tehlike satırı (açıklama onay penceresinde ve altında). */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const outcome = leaveOutcome(group.myRole, group.memberCount);

  if (compact) {
    return (
      <>
        {outcome === "must_transfer" ? (
          <div className="space-y-2 px-4 py-3.5">
            <p className="text-small text-text-secondary">{t("groups.about.ownerMustTransfer")}</p>
            <Button type="button" variant="outline" size="sm" onClick={onGoToMembers}>
              {t("groups.about.goTransfer")}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            data-leave-community
            className="flex h-14 w-full items-center gap-3.5 px-4 text-left text-body text-danger transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft" aria-hidden>
              <LogOut size={18} strokeWidth={1.75} />
            </span>
            {t("groups.about.leave")}
          </button>
        )}
        {outcome !== "must_transfer" && <p className="px-4 pb-3.5 text-caption leading-relaxed text-text-muted">{t("groups.about.leaveAlsoChat")}</p>}
        {confirm && (
          <LeaveCommunityDialog groupId={group.id} name={group.name} role={group.myRole} memberCount={group.memberCount} onLeft={onLeft} onClose={() => setConfirm(false)} />
        )}
      </>
    );
  }

  return (
    <section className="space-y-2 border-t border-border-soft pt-5" aria-labelledby="leave-community-section-title">
      <h3 id="leave-community-section-title" className="text-label font-semibold text-text">
        {t("groups.about.leaveTitle")}
      </h3>
      {outcome === "must_transfer" ? (
        <>
          <p className="text-small text-text-secondary">{t("groups.about.ownerMustTransfer")}</p>
          <Button type="button" variant="outline" size="sm" onClick={onGoToMembers}>
            {t("groups.about.goTransfer")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-small text-text-secondary">{outcome === "closes_group" ? t("groups.about.leaveClosesGroup") : t("groups.about.leaveHelp")}</p>
          <p className="text-caption text-text-muted">{t("groups.about.leaveAlsoChat")}</p>
          <Button type="button" variant="outline" size="sm" className="text-danger" onClick={() => setConfirm(true)}>
            <LogOut size={14} /> {t("groups.about.leave")}
          </Button>
        </>
      )}
      {confirm && (
        <LeaveCommunityDialog groupId={group.id} name={group.name} role={group.myRole} memberCount={group.memberCount} onLeft={onLeft} onClose={() => setConfirm(false)} />
      )}
    </section>
  );
}
