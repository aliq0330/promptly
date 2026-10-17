"use client";

import { ConfirmDialog } from "./confirm-dialog";
import { useAsyncAction } from "./use-async-action";
import { leaveChatGroup } from "@/lib/supabase/chat-groups";
import { leaveOutcome } from "@/lib/chat-groups";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupRole } from "@/types";

/**
 * Topluluktan ayrılmanın TEK onay penceresi (başlık üyelik menüsü, Hakkında sekmesi ve sohbet bilgi penceresi aynısını kullanır).
 * Veri modelinde topluluk üyeliği ile sohbet üyeliği TEK satırdır (`conversation_members`, docs/history/175-*): ayrılmak ikisinden birden
 * çıkarır. Yalnızca sohbeti bırakmak isteyen kişi "Sessize al" ya da "Listemden kaldır"ı kullanır — bu pencere bunu açıkça söyler.
 * Sahip, başka üye varken ayrılamaz (önce devreder); tek kişiyse ayrılmak topluluğu siler.
 */
export function LeaveCommunityDialog({
  groupId,
  name,
  role,
  memberCount,
  onLeft,
  onClose,
}: {
  groupId: string;
  name: string;
  role: GroupRole;
  memberCount: number;
  onLeft: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const outcome = leaveOutcome(role, memberCount);

  async function leave() {
    const done = await action.run(async () => {
      await leaveChatGroup(groupId);
      return true;
    });
    if (done) onLeft();
  }

  return (
    <ConfirmDialog
      id="leave-community-title"
      title={outcome === "closes_group" ? t("groups.about.leaveClosesTitle") : t("groups.about.leaveConfirmTitle", { name })}
      body={outcome === "closes_group" ? t("groups.about.leaveClosesGroup") : t("groups.about.leaveConfirmBody")}
      confirmLabel={t("groups.about.leave")}
      danger
      busy={action.busy}
      error={action.error}
      onConfirm={() => void leave()}
      onCancel={onClose}
    />
  );
}
