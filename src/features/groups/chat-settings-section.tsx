"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldLabelClassName } from "@/components/ui/field";
import { OptionGroup } from "@/components/ui/option-group";
import { GroupOwnerSettings } from "./group-owner-settings";
import { useAsyncAction } from "./use-async-action";
import { updateChatGroup } from "@/lib/supabase/chat-groups";
import { can } from "@/lib/chat-groups";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupPostingPolicy } from "@/types";
import { InlineAlert } from "@/components/ui/inline-alert";

/**
 * SOHBET ayarları (sohbet bilgi penceresi, yetkililere): kim mesaj yazabilir (`edit_settings`), yeni üyeler geçmişi görür mü ve üyeler
 * sabitleyebilir mi (yalnız owner). Topluluğun kendi ayarları (ad, görsel, görünürlük, yetkiler) topluluk sayfasındaki "Yönet → Ayarlar"dadır.
 * Her ikisi de aynı sunucu işlemlerini kullanır (`update_chat_group`, `update_chat_group_owner_settings`); yetki orada yeniden doğrulanır.
 */
export function ChatSettingsSection({
  group,
  onChanged,
  onToast,
}: {
  group: ChatGroup;
  onChanged: () => void | Promise<void>;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const save = useAsyncAction();
  const [posting, setPosting] = useState<GroupPostingPolicy>(group.postingPolicy);
  const canPosting = can(group.myRole, "edit_settings", group.rolePermissions);
  const dirty = posting !== group.postingPolicy;

  async function handleSave() {
    if (!dirty) return;
    const done = await save.run(async () => {
      await updateChatGroup(group.id, { postingPolicy: posting });
      return true;
    });
    if (!done) return;
    onToast(t("groups.settings.savedToast"));
    await onChanged();
  }

  return (
    <div className="space-y-6">
      {canPosting && (
        <section aria-labelledby="chat-posting-title" className="space-y-3">
          <div className="space-y-2">
            <p id="chat-posting-title" className={fieldLabelClassName}>
              {t("groups.settings.postingLabel")}
            </p>
            <OptionGroup<"members" | "admins">
              labelledBy="chat-posting-title"
              value={posting}
              onChange={setPosting}
              disabled={save.busy}
              options={[
                { key: "members", label: t("groups.settings.postingMembers"), description: t("groups.settings.postingMembersHelp") },
                { key: "admins", label: t("groups.settings.postingAdmins"), description: t("groups.settings.postingAdminsHelp") },
              ]}
            />
          </div>
          {save.error && (
            <InlineAlert>
              {save.error}
            </InlineAlert>
          )}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => void handleSave()} disabled={save.busy || !dirty}>
              {save.busy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </section>
      )}
      {group.myRole === "owner" && <GroupOwnerSettings group={group} scope="chat" onChanged={onChanged} onToast={onToast} />}
    </div>
  );
}
