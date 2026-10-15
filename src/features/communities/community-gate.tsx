"use client";

import { useState } from "react";
import { Loader2, Lock, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { RulesAcceptModal } from "./rules-accept";
import type { CommunityGate as Gate } from "./use-community";
import { cancelJoinRequest } from "@/lib/supabase/chat-groups";
import { joinCommunity, respondToCommunityInvitation } from "@/lib/supabase/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { ChatGroup } from "@/types";

/**
 * Üye olmayan ziyaretçi için "geçit": herkese açık toplulukta Katıl (kurallar kabul zorunluysa önce kural metni), davetliye Kabul/Reddet,
 * başvurana "bekliyor" + geri çek. Kapalı bir toplulukta üye olmayan kişi yalnızca davet/başvuru durumunu görür; içerik, sohbet ve üye listesi
 * açılmaz. `compact`: içerik zaten okunabiliyorsa (açık topluluk) sayfanın üstünde ince bir şerit.
 */
export function CommunityGate({ group, gate, onChanged, onToast, compact = false }: { group: ChatGroup; gate: Gate; onChanged: () => Promise<void>; onToast: (message: string) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const [rulesOpen, setRulesOpen] = useState<"join" | "invite" | null>(null);
  const full = group.memberCount >= group.memberLimit;
  const needsRules = group.rulesRequired && Boolean(group.rules);

  async function join(acceptRules: boolean) {
    const outcome = await action.run(() => joinCommunity(group.id, acceptRules));
    if (!outcome) return false;
    onToast(t("groups.page.joinedToast", { name: group.name }));
    await onChanged();
    return true;
  }

  async function respond(accept: boolean, acceptRules: boolean) {
    if (!gate.invitationId) return false;
    const invitationId = gate.invitationId;
    const result = await action.run(() => respondToCommunityInvitation(invitationId, accept, acceptRules));
    if (!result) return false;
    onToast(accept ? t("groups.page.joinedToast", { name: group.name }) : t("groups.invites.declinedToast"));
    await onChanged();
    return true;
  }

  async function cancelRequest() {
    if (!gate.requestId) return;
    const requestId = gate.requestId;
    const ok = await action.run(async () => {
      await cancelJoinRequest(requestId);
      return true;
    });
    if (!ok) return;
    onToast(t("groups.invites.requestCancelledToast"));
    await onChanged();
  }

  let body: React.ReactNode;
  let Icon = Lock;
  if (gate.invitationId) {
    Icon = Mail;
    body = (
      <>
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-text">{gate.inviterName ? t("communities.gate.invitedBy", { name: gate.inviterName }) : t("communities.gate.invited")}</p>
          <p className="text-caption text-text-muted">{t("communities.gate.invitedHelp")}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => void respond(false, false)} disabled={action.busy}>
            {t("groups.invites.decline")}
          </Button>
          <Button type="button" size="sm" onClick={() => (needsRules ? setRulesOpen("invite") : void respond(true, false))} disabled={action.busy}>
            {action.busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {t("groups.invites.accept")}
          </Button>
        </div>
      </>
    );
  } else if (gate.requestId) {
    Icon = Send;
    body = (
      <>
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-text">{t("communities.gate.requested")}</p>
          <p className="text-caption text-text-muted">{t("communities.gate.requestedHelp")}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => void cancelRequest()} disabled={action.busy}>
          {t("groups.invites.cancelRequest")}
        </Button>
      </>
    );
  } else if (group.visibility === "public") {
    body = (
      <>
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-text">{group.closedAt ? t("communities.gate.closed") : t("communities.gate.publicJoin")}</p>
          <p className="text-caption text-text-muted">{group.closedAt ? t("communities.gate.closedHelp") : t("communities.gate.publicJoinHelp")}</p>
        </div>
        <Button type="button" size="sm" onClick={() => (needsRules ? setRulesOpen("join") : void join(false))} disabled={action.busy || full || Boolean(group.closedAt)}>
          {action.busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {full ? t("groups.page.full") : t("groups.page.join")}
        </Button>
      </>
    );
  } else {
    body = (
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium text-text">{t("communities.gate.privateTitle")}</p>
        <p className="text-caption text-text-muted">{t("communities.gate.privateHelp")}</p>
      </div>
    );
  }

  return (
    <section
      aria-label={t("communities.gate.aria")}
      className={cn("flex flex-col gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:flex-row sm:items-center", !compact && "p-5")}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon size={18} aria-hidden />
      </span>
      {body}
      {action.error && !rulesOpen && (
        <p role="alert" className="w-full text-small text-danger sm:basis-full">
          {action.error}
        </p>
      )}
      {rulesOpen && (
        <RulesAcceptModal
          name={group.name}
          rules={group.rules ?? ""}
          confirmLabel={t("communities.rules.acceptAndJoin")}
          busy={action.busy}
          error={action.error}
          onClose={() => setRulesOpen(null)}
          onConfirm={() => void (rulesOpen === "join" ? join(true) : respond(true, true)).then((ok) => ok && setRulesOpen(null))}
        />
      )}
    </section>
  );
}
