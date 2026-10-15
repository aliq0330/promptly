"use client";

import { useState } from "react";
import { BellOff, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { VisibilityLabel } from "@/features/communities/visibility-label";
import { RoleBadge } from "./role-badge";
import { useAsyncAction } from "./use-async-action";
import { leaveChatGroup, setChatGroupMuted } from "@/lib/supabase/chat-groups";
import { leaveOutcome } from "@/lib/chat-groups";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { ChatGroup } from "@/types";

/**
 * Grup bilgisi: açıklama, görünürlük, üye sayısı / sınırı, kim yazabilir, kişisel bildirim tercihi (sessize al),
 * ve gruptan ayrılma. Ayrılmak, çıkarılmaktan ve grubu silmekten ayrı bir işlemdir; sahip başka üye varken ayrılamaz.
 */
export function GroupAboutSection({
  group,
  mutedAt,
  onMutedChange,
  onLeft,
  onGoToMembers,
  onToast,
}: {
  group: ChatGroup;
  mutedAt: string | null;
  onMutedChange: (mutedAt: string | null) => void;
  onLeft: () => void;
  onGoToMembers: () => void;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const mute = useAsyncAction();
  const leave = useAsyncAction();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const outcome = leaveOutcome(group.myRole, group.memberCount);
  const muted = Boolean(mutedAt);

  async function toggleMute() {
    if (!user) return;
    const next = await mute.run(() => setChatGroupMuted(group.id, user.id, !muted));
    if (next === undefined) return;
    onMutedChange(next);
    onToast(next ? t("groups.about.mutedToast") : t("groups.about.unmutedToast"));
  }

  async function handleLeave() {
    const done = await leave.run(async () => {
      await leaveChatGroup(group.id);
      return true;
    });
    if (done) onLeft();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-label font-semibold text-text">{t("groups.about.description")}</h3>
        <p className={cn("break-words text-small", group.description ? "text-text-secondary" : "text-text-muted")}>{group.description || t("groups.about.noDescription")}</p>
      </section>

      <dl className="grid gap-3 text-small sm:grid-cols-2">
        <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2.5">
          <dt className="text-caption text-text-muted">{t("groups.visibility.label")}</dt>
          <dd className="mt-0.5 font-medium text-text">
            <VisibilityLabel visibility={group.visibility} size={14} className="flex items-center gap-1.5" />
          </dd>
        </div>
        <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2.5">
          <dt className="text-caption text-text-muted">{t("groups.about.members")}</dt>
          <dd className="mt-0.5 font-medium text-text">{t("groups.about.membersValue", { count: group.memberCount, max: group.memberLimit })}</dd>
        </div>
        <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2.5">
          <dt className="text-caption text-text-muted">{t("groups.settings.postingLabel")}</dt>
          <dd className="mt-0.5 font-medium text-text">{group.postingPolicy === "admins" ? t("groups.settings.postingAdmins") : t("groups.settings.postingMembers")}</dd>
        </div>
        <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2.5">
          <dt className="text-caption text-text-muted">{t("groups.about.history")}</dt>
          <dd className="mt-0.5 font-medium text-text">{group.historyVisible ? t("groups.about.historyVisibleValue") : t("groups.about.historyHiddenValue")}</dd>
        </div>
        <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2.5">
          <dt className="text-caption text-text-muted">{t("groups.about.yourRole")}</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-text">
            {group.myRole === "member" ? t("groups.role.member") : <RoleBadge role={group.myRole} />}
          </dd>
        </div>
      </dl>

      <section className="space-y-2" aria-labelledby="about-notifications-title">
        <h3 id="about-notifications-title" className="text-label font-semibold text-text">
          {t("groups.about.notifications")}
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={muted}
          onClick={() => void toggleMute()}
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
      </section>

      <section className="space-y-2 border-t border-border-soft pt-5" aria-labelledby="about-leave-title">
        <h3 id="about-leave-title" className="text-label font-semibold text-text">
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
            <Button type="button" variant="outline" size="sm" className="text-danger" onClick={() => { leave.setError(null); setConfirmLeave(true); }}>
              <LogOut size={14} /> {t("groups.about.leave")}
            </Button>
          </>
        )}
      </section>

      {confirmLeave && (
        <ConfirmDialog
          id="leave-group-title"
          title={outcome === "closes_group" ? t("groups.about.leaveClosesTitle") : t("groups.about.leaveConfirmTitle", { name: group.name })}
          body={outcome === "closes_group" ? t("groups.about.leaveClosesGroup") : t("groups.about.leaveConfirmBody")}
          confirmLabel={t("groups.about.leave")}
          danger
          busy={leave.busy}
          error={leave.error}
          onConfirm={() => void handleLeave()}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
