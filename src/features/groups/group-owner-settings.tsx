"use client";

import { useState } from "react";
import { History } from "@/components/icons/history";
import { Pin } from "@/components/icons/pin";
import { RotateCcw } from "@/components/icons/rotate-ccw";
import { ShieldCheck } from "@/components/icons/shield-check";
import { Button } from "@/components/ui/button";
import { OptionGroup } from "@/components/ui/option-group";
import { useAsyncAction } from "./use-async-action";
import { updateChatGroupOwnerSettings } from "@/lib/supabase/chat-groups";
import { capabilitiesFor, DEFAULT_ROLE_PERMISSIONS } from "@/lib/chat-groups";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupCapability, RolePermissions } from "@/types";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SwitchRow } from "@/components/ui/switch";

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
          <History size={16} aria-hidden /> {t("groups.owner.historyTitle")}
        </h3>
        <p className="text-caption text-text-muted">{t("groups.owner.historyHelp")}</p>
        <OptionGroup<"hidden" | "visible">
          ariaLabel={t("groups.owner.historyTitle")}
          value={history ? "visible" : "hidden"}
          onChange={(key) => setHistory(key === "visible")}
          disabled={save.busy}
          options={[
            { key: "hidden", label: t("groups.owner.historyHidden"), description: t("groups.owner.historyHiddenHelp") },
            { key: "visible", label: t("groups.owner.historyVisible"), description: t("groups.owner.historyVisibleHelp") },
          ]}
        />
      </section>
      )}

      {chatScope && (
      <section aria-labelledby="owner-pin-title" className="space-y-3">
        <h3 id="owner-pin-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
          <Pin size={16} aria-hidden /> {t("groups.owner.pinTitle")}
        </h3>
        <SwitchRow
          checked={membersCanPin}
          onChange={setMembersCanPin}
          label={t("groups.owner.membersCanPin")}
          disabled={save.busy}
          className="rounded-md px-2 py-2 transition-colors hover:bg-surface-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-small font-medium text-text">{t("groups.owner.membersCanPin")}</span>
            <span className="block text-caption text-text-muted">{t("groups.owner.membersCanPinHelp")}</span>
          </span>
        </SwitchRow>
      </section>
      )}

      {!chatScope && (
      <section aria-labelledby="owner-permissions-title" className="space-y-4">
        <div className="space-y-1">
          <h3 id="owner-permissions-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
            <ShieldCheck size={16} aria-hidden /> {t("groups.owner.permissionsTitle")}
          </h3>
          <p className="text-caption text-text-muted">{t("groups.owner.permissionsHelp")}</p>
        </div>
        <div className="grid items-start gap-3 md:grid-cols-2">
        {ROLES.map((role) => (
          <fieldset key={role} className="space-y-1 rounded-lg border border-border-soft p-3" disabled={save.busy}>
            <legend className="px-1 text-small font-semibold text-text">{t(`groups.role.${role}`)}</legend>
            {capabilitiesFor(role).map((cap) => {
              const on = perms[role][cap];
              return (
                <SwitchRow
                  key={cap}
                  checked={on}
                  onChange={() => toggle(role, cap)}
                  label={`${t(`groups.role.${role}`)}: ${t(`groups.cap.${cap}`)}`}
                  className="rounded-md px-2 py-2 transition-colors hover:bg-surface-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-medium text-text">{t(`groups.cap.${cap}`)}</span>
                    <span className="block text-caption text-text-muted">{t(`groups.cap.${cap}Help`)}</span>
                  </span>
                </SwitchRow>
              );
            })}
          </fieldset>
        ))}
        </div>
        <p className="text-caption text-text-muted">{t("groups.owner.fixedHelp")}</p>
        <div>
          <Button type="button" variant="ghost" size="sm" disabled={save.busy || atDefaults} onClick={() => setPerms(DEFAULT_ROLE_PERMISSIONS)}>
            <RotateCcw size={16} /> {t("groups.owner.resetDefaults")}
          </Button>
        </div>
      </section>
      )}

      {save.error && (
        <InlineAlert>
          {save.error}
        </InlineAlert>
      )}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={save.busy || (!historyChanged && !permsChanged && !pinChanged)}>
          {save.busy ? t("common.saving") : t("groups.owner.save")}
        </Button>
      </div>
    </div>
  );
}
