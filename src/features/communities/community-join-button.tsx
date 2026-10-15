"use client";

import { useState } from "react";
import { ChevronDown, Loader2, LogOut, Send, Undo2 } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { DropdownMenu, MenuItem } from "./dropdown-menu";
import { RulesAcceptModal } from "./rules-accept";
import { fetchChatGroupRow, leaveChatGroup } from "@/lib/supabase/chat-groups";
import { cancelMyJoinRequest, joinCommunity, requestJoinCommunity } from "@/lib/supabase/communities";
import { leaveOutcome } from "@/lib/chat-groups";
import { visibilityTraits } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupRole, GroupVisibility } from "@/types";

export type JoinState = "member" | "invited" | "requested" | "none";

export interface JoinTarget {
  id: string;
  name: string;
  visibility: GroupVisibility;
  rulesRequired: boolean;
  memberCount: number;
  memberLimit: number;
  /** Kapatılmış (salt-okunur) topluluk: yeni üye alınmaz. */
  closed: boolean;
}

/**
 * Topluluğun TEK üyelik düğmesi (kart ve topluluk sayfası aynı bileşeni kullanır):
 *   üye değil + herkese açık → "Katıl" (kurallar kabul zorunluysa önce kural metni)
 *   üye değil + kapalı        → "İstek gönder" (yönetici onaylar)
 *   isteğim bekliyor          → "İstek gönderildi ▼" → "İsteği geri çek"
 *   üyeyim                    → "Katıldın ▼" → "Bu topluluktan ayrıl" (onaylı)
 *   davetliyim                → "Davet edildin" (`onInvited` verilmişse; yoksa davet geçidi zaten sayfada)
 *   tamamen kapalı + üye değil → hiçbir şey (varlığı sızmaz)
 * Gerçek yetki/kurallar veritabanındadır; bu bileşen yalnızca doğru RPC'yi çağırır ve sunucunun hatasını çevrilmiş olarak gösterir.
 */
export function CommunityJoinButton({
  target,
  status,
  role,
  rules,
  onChange,
  onToast,
  onInvited,
  size = "sm",
}: {
  target: JoinTarget;
  status: JoinState;
  role: GroupRole | null;
  /** Kural metni biliniyorsa verilir; verilmezse (kart listesi) gerektiğinde çekilir. */
  rules?: string | null;
  onChange: (next: JoinState) => void;
  onToast: (message: string) => void;
  onInvited?: () => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const action = useAsyncAction();
  const [rulesFor, setRulesFor] = useState<"join" | "request" | null>(null);
  const [rulesText, setRulesText] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const mode = visibilityTraits(target.visibility).joinMode;
  const full = target.memberCount >= target.memberLimit;
  const outcomeIfLeave = role ? leaveOutcome(role, target.memberCount) : "leave";

  async function join(acceptRules: boolean) {
    const outcome = await action.run(() => joinCommunity(target.id, acceptRules));
    if (!outcome) return false;
    onToast(t("groups.page.joinedToast", { name: target.name }));
    onChange("member");
    return true;
  }

  async function request(acceptRules: boolean) {
    const outcome = await action.run(() => requestJoinCommunity(target.id, acceptRules));
    if (!outcome) return false;
    if (outcome === "joined" || outcome === "already_member") {
      onToast(t("groups.page.joinedToast", { name: target.name }));
      onChange("member");
    } else {
      onToast(t("communities.join.requestedToast", { name: target.name }));
      onChange("requested");
    }
    return true;
  }

  // Kuralları kabul zorunluysa kural metni önce okunur; kart listesinde metin yoktur, açılırken çekilir.
  async function start(kind: "join" | "request") {
    if (!target.rulesRequired) {
      await (kind === "join" ? join(false) : request(false));
      return;
    }
    let text = rules;
    if (text === undefined) {
      const row = await action.run(() => fetchChatGroupRow(target.id));
      if (!row) return;
      text = row.rules;
    }
    setRulesText(text ?? "");
    setRulesFor(kind);
  }

  async function withdraw() {
    if (!user) return;
    const done = await action.run(() => cancelMyJoinRequest(target.id, user.id));
    if (done === undefined) return;
    onToast(t("groups.invites.requestCancelledToast"));
    onChange("none");
  }

  async function leave() {
    const done = await action.run(async () => {
      await leaveChatGroup(target.id);
      return true;
    });
    if (!done) return;
    setConfirmLeave(false);
    onToast(t("communities.join.leftToast", { name: target.name }));
    onChange("none");
  }

  const trigger = (label: string) => (
    <>
      {action.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
      {label}
      <ChevronDown size={14} aria-hidden />
    </>
  );

  let control: React.ReactNode = null;
  if (status === "member") {
    control = (
      <DropdownMenu
        label={t("communities.join.menuAria", { status: t("communities.join.joined"), name: target.name })}
        triggerClassName={buttonClassName({ size, variant: "outline" })}
        trigger={trigger(t("communities.join.joined"))}
      >
        {(close) =>
          outcomeIfLeave === "must_transfer" ? (
            <>
              <MenuItem icon={<LogOut size={14} />} label={t("groups.about.leave")} onClick={close} disabled />
              <p className="max-w-56 px-3.5 pb-2 pt-1 text-caption text-text-muted">{t("communities.join.ownerCannotLeave")}</p>
            </>
          ) : (
            <MenuItem
              icon={<LogOut size={14} />}
              label={t("groups.about.leave")}
              danger
              onClick={() => {
                close();
                action.setError(null);
                setConfirmLeave(true);
              }}
            />
          )
        }
      </DropdownMenu>
    );
  } else if (status === "requested") {
    control = (
      <DropdownMenu
        label={t("communities.join.menuAria", { status: t("communities.card.requested"), name: target.name })}
        triggerClassName={buttonClassName({ size, variant: "secondary" })}
        trigger={trigger(t("communities.card.requested"))}
      >
        {(close) => (
          <MenuItem
            icon={<Undo2 size={14} />}
            label={t("communities.join.withdraw")}
            onClick={() => {
              close();
              void withdraw();
            }}
          />
        )}
      </DropdownMenu>
    );
  } else if (status === "invited") {
    control = onInvited ? (
      <Button type="button" size={size} variant="secondary" onClick={onInvited}>
        {t("groups.page.invited")}
      </Button>
    ) : null;
  } else if (mode === "join") {
    control = (
      <Button type="button" size={size} onClick={() => void start("join")} disabled={action.busy || full || target.closed} aria-label={t("groups.page.joinAria", { name: target.name })}>
        {action.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
        {target.closed ? t("communities.join.closed") : full ? t("groups.page.full") : t("groups.page.join")}
      </Button>
    );
  } else if (mode === "request") {
    control = (
      <Button type="button" size={size} onClick={() => void start("request")} disabled={action.busy || full || target.closed} aria-label={t("communities.join.requestAria", { name: target.name })}>
        {action.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
        {target.closed ? t("communities.join.closed") : full ? t("groups.page.full") : t("communities.join.request")}
      </Button>
    );
  }

  if (!control) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {control}
      {action.error && !rulesFor && !confirmLeave && (
        <p role="alert" className="max-w-64 text-right text-caption text-danger">
          {action.error}
        </p>
      )}
      {rulesFor && (
        <RulesAcceptModal
          name={target.name}
          rules={rulesText}
          confirmLabel={rulesFor === "join" ? t("communities.rules.acceptAndJoin") : t("communities.rules.acceptAndRequest")}
          busy={action.busy}
          error={action.error}
          onClose={() => setRulesFor(null)}
          onConfirm={() => void (rulesFor === "join" ? join(true) : request(true)).then((ok) => ok && setRulesFor(null))}
        />
      )}
      {confirmLeave && (
        <ConfirmDialog
          id="leave-community-title"
          title={outcomeIfLeave === "closes_group" ? t("groups.about.leaveClosesTitle") : t("groups.about.leaveConfirmTitle", { name: target.name })}
          body={outcomeIfLeave === "closes_group" ? t("groups.about.leaveClosesGroup") : t("groups.about.leaveConfirmBody")}
          confirmLabel={t("groups.about.leave")}
          danger
          busy={action.busy}
          error={action.error}
          onConfirm={() => void leave()}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
