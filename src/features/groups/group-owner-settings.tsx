"use client";

import { useState } from "react";
import { History, Pin, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/field";
import { useAsyncAction } from "./use-async-action";
import { updateChatGroupOwnerSettings } from "@/lib/supabase/chat-groups";
import { capabilitiesFor, DEFAULT_ROLE_PERMISSIONS } from "@/lib/chat-groups";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupCapability, RolePermissions } from "@/types";

const ROLES = ["admin", "moderator"] as const;

/**
 * YALNIZCA OWNER. İki kapsamdan birini gösterir (aynı sunucu işlemi `update_chat_group_owner_settings`, yalnız DEĞİŞEN alanlar gider):
 *   • `chat`      → SOHBET ayarları: yeni üyenin katılmadan önceki mesajları görüp görmeyeceği + üyeler mesaj sabitleyebilir mi
 *                   (sohbet bilgi penceresinde);
 *   • `community` → TOPLULUK yetkileri: admin ve moderatörün hangi yetkilere sahip olduğu (rol başına açma/kapama; varsayılanlar
 *                   bugünkü matrisle aynı) — topluluk "Yönet → Ayarlar"ında.
 * Owner her zaman her şeyi yapar; sahipliği devretme ve topluluğu silme owner'da kalır. Sunucu owner dışını reddeder; burası yalnızca gösterir.
 */
export function GroupOwnerSettings({
  group,
  scope,
  onChanged,
  onToast,
}: {
  group: ChatGroup;
  scope: "chat" | "community";
  onChanged: () => void | Promise<void>;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const save = useAsyncAction();
  const [history, setHistory] = useState(group.historyVisible);
  const [membersCanPin, setMembersCanPin] = useState(group.membersCanPin);
  const [perms, setPerms] = useState<RolePermissions>(group.rolePermissions);

  const changedPerms: Partial<Record<(typeof ROLES)[number], Partial<Record<GroupCapability, boolean>>>> = {};
  for (const role of ROLES) {
    for (const cap of capabilitiesFor(role)) {
      if (perms[role][cap] !== group.rolePermissions[role][cap]) changedPerms[role] = { ...changedPerms[role], [cap]: perms[role][cap] };
    }
  }
  const chatScope = scope === "chat";
  const historyChanged = chatScope && history !== group.historyVisible;
  const pinChanged = chatScope && membersCanPin !== group.membersCanPin;
  const permsChanged = !chatScope && Object.keys(changedPerms).length > 0;
  const atDefaults = ROLES.every((role) => capabilitiesFor(role).every((cap) => perms[role][cap] === DEFAULT_ROLE_PERMISSIONS[role][cap]));

  function toggle(role: (typeof ROLES)[number], cap: GroupCapability) {
    setPerms((prev) => ({ ...prev, [role]: { ...prev[role], [cap]: !prev[role][cap] } }));
  }

  async function handleSave() {
    const done = await save.run(async () => {
      await updateChatGroupOwnerSettings(group.id, {
        ...(historyChanged ? { historyVisible: history } : {}),
        ...(pinChanged ? { membersCanPin } : {}),
        ...(permsChanged ? { rolePermissions: changedPerms } : {}),
      });
      return true;
    });
    if (!done) return;
    onToast(t("groups.owner.savedToast"));
    await onChanged();
  }

  return (
    <div className={cn("space-y-8", !chatScope && "border-t border-border-soft pt-6")}>
      {chatScope && (
      <section aria-labelledby="owner-history-title" className="space-y-3">
        <h3 id="owner-history-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
          <History size={14} aria-hidden /> {t("groups.owner.historyTitle")}
        </h3>
        <p className="text-caption text-text-muted">{t("groups.owner.historyHelp")}</p>
        <fieldset className="space-y-2" disabled={save.busy}>
          <legend className="sr-only">{t("groups.owner.historyTitle")}</legend>
          <ChoiceCard>
            <input type="radio" name="history-visible" checked={!history} onChange={() => setHistory(false)} className="mt-1 accent-[var(--color-primary)]" />
            <span>
              <span className="block font-medium">{t("groups.owner.historyHidden")}</span>
              <span className="block text-caption text-text-muted">{t("groups.owner.historyHiddenHelp")}</span>
            </span>
          </ChoiceCard>
          <ChoiceCard>
            <input type="radio" name="history-visible" checked={history} onChange={() => setHistory(true)} className="mt-1 accent-[var(--color-primary)]" />
            <span>
              <span className="block font-medium">{t("groups.owner.historyVisible")}</span>
              <span className="block text-caption text-text-muted">{t("groups.owner.historyVisibleHelp")}</span>
            </span>
          </ChoiceCard>
        </fieldset>
      </section>
      )}

      {chatScope && (
      <section aria-labelledby="owner-pin-title" className="space-y-3">
        <h3 id="owner-pin-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
          <Pin size={14} aria-hidden /> {t("groups.owner.pinTitle")}
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={membersCanPin}
          aria-label={t("groups.owner.membersCanPin")}
          disabled={save.busy}
          onClick={() => setMembersCanPin((prev) => !prev)}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-soft disabled:opacity-60"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-text">{t("groups.owner.membersCanPin")}</span>
            <span className="block text-caption text-text-muted">{t("groups.owner.membersCanPinHelp")}</span>
          </span>
          <span aria-hidden className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", membersCanPin ? "bg-primary" : "bg-border-strong")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-xs transition-all", membersCanPin ? "left-[1.125rem]" : "left-0.5")} />
          </span>
        </button>
      </section>
      )}

      {!chatScope && (
      <section aria-labelledby="owner-permissions-title" className="space-y-4">
        <div className="space-y-1">
          <h3 id="owner-permissions-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
            <ShieldCheck size={14} aria-hidden /> {t("groups.owner.permissionsTitle")}
          </h3>
          <p className="text-caption text-text-muted">{t("groups.owner.permissionsHelp")}</p>
        </div>
        {ROLES.map((role) => (
          <fieldset key={role} className="space-y-1 rounded-lg border border-border-soft p-3" disabled={save.busy}>
            <legend className="px-1 text-small font-semibold text-text">{t(`groups.role.${role}`)}</legend>
            {capabilitiesFor(role).map((cap) => {
              const on = perms[role][cap];
              return (
                <button
                  key={cap}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${t(`groups.role.${role}`)}: ${t(`groups.cap.${cap}`)}`}
                  onClick={() => toggle(role, cap)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-soft disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text">{t(`groups.cap.${cap}`)}</span>
                    <span className="block text-caption text-text-muted">{t(`groups.cap.${cap}Help`)}</span>
                  </span>
                  <span aria-hidden className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-border-strong")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-xs transition-all", on ? "left-[1.125rem]" : "left-0.5")} />
                  </span>
                </button>
              );
            })}
          </fieldset>
        ))}
        <p className="text-caption text-text-muted">{t("groups.owner.fixedHelp")}</p>
        <div>
          <Button type="button" variant="ghost" size="sm" disabled={save.busy || atDefaults} onClick={() => setPerms(DEFAULT_ROLE_PERMISSIONS)}>
            <RotateCcw size={14} /> {t("groups.owner.resetDefaults")}
          </Button>
        </div>
      </section>
      )}

      {save.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {save.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={save.busy || (!historyChanged && !permsChanged && !pinChanged)}>
          {save.busy ? t("common.saving") : t("groups.owner.save")}
        </Button>
      </div>
    </div>
  );
}
