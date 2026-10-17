"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, fieldLabelClassName } from "@/components/ui/field";
import { GroupOwnerSettings } from "./group-owner-settings";
import { useAsyncAction } from "./use-async-action";
import { updateChatGroup } from "@/lib/supabase/chat-groups";
import { can } from "@/lib/chat-groups";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupPostingPolicy } from "@/types";

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
          <fieldset className="space-y-2" disabled={save.busy}>
            <legend id="chat-posting-title" className={fieldLabelClassName}>
              {t("groups.settings.postingLabel")}
            </legend>
            <ChoiceCard>
              <input type="radio" name="posting-policy" checked={posting === "members"} onChange={() => setPosting("members")} className="mt-1 accent-[var(--color-primary)]" />
              <span>
                <span className="block font-medium">{t("groups.settings.postingMembers")}</span>
                <span className="block text-caption text-text-muted">{t("groups.settings.postingMembersHelp")}</span>
              </span>
            </ChoiceCard>
            <ChoiceCard>
              <input type="radio" name="posting-policy" checked={posting === "admins"} onChange={() => setPosting("admins")} className="mt-1 accent-[var(--color-primary)]" />
              <span>
                <span className="block font-medium">{t("groups.settings.postingAdmins")}</span>
                <span className="block text-caption text-text-muted">{t("groups.settings.postingAdminsHelp")}</span>
              </span>
            </ChoiceCard>
          </fieldset>
          {save.error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {save.error}
            </p>
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
