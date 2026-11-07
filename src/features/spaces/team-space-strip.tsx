"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Users } from "@/components/icons/users";
import { Button, buttonClassName } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { composeSpaceShareBody } from "@/features/messages/space-share-format";
import { sendMessage } from "@/lib/supabase/messages";
import { useTranslation } from "@/lib/i18n/language-provider";
import { communityChatHref, communityHref } from "@/lib/communities";
import { fetchCommunityCard } from "@/lib/supabase/communities";

/**
 * Ekibe bağlı Space'in üstündeki şerit (docs/history/349-*): Space, topluluk sayfası ve topluluk sohbeti TEK ekibin üç yüzüdür;
 * buradan ikisine tek dokunuşla geçilir. Ekip adı kart RPC'sinden (üyeye açık) okunur; okunamazsa şerit adsız çizilir.
 */
/**
 * Ekibin sohbetine Space bağlantısını gönderir (docs/history/349-*): mevcut paylaşım biçimi (başlık + gerçek bağlantı; yeni mesaj şeması yok).
 * Gönderen ekip üyesidir (Space'i görebilen herkes); sunucuda mesaj yazma kuralları (yazma politikası, askı, hız) aynen geçerlidir.
 */
export function useShareToTeamChat(communityId: string, space: { id: string; title: string }, note = "") {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  async function send() {
    if (!user || state === "sending") return;
    setState("sending");
    try {
      await sendMessage(communityId, user.id, { body: composeSpaceShareBody(note, space.title, space.id) });
      setState("sent");
    } catch {
      setState("failed");
    }
  }
  return { state, send };
}

/** Tek bir prompt için "Sohbete gönder": mesaja prompt başlığı not olarak düşer, Space bağlantısı aynen eklenir. */
export function TeamShareButton({ communityId, space, title }: { communityId: string; space: { id: string; title: string }; title: string }) {
  const { t } = useTranslation();
  const share = useShareToTeamChat(communityId, space, t("team.share.promptNote", { title }));
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={share.state === "sending"}
      onClick={() => void share.send()}
      data-team-share-prompt
      title={share.state === "failed" ? t("team.share.failed") : undefined}
    >
      <MessagesSquare size={14} aria-hidden />
      {share.state === "sent" ? t("team.share.sent") : share.state === "sending" ? t("team.share.sending") : t("team.share.button")}
    </Button>
  );
}

export function TeamSpaceStrip({ communityId, space }: { communityId: string; space: { id: string; title: string } }) {
  const { t } = useTranslation();
  const [name, setName] = useState<string | null>(null);
  const share = useShareToTeamChat(communityId, space);

  useEffect(() => {
    let alive = true;
    fetchCommunityCard(communityId)
      .then((card) => alive && setName(card?.name ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [communityId]);

  return (
    <div data-testid="team-space-strip" className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-surface-soft px-3 py-2">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-small font-semibold text-text">
        <Users size={16} aria-hidden className="shrink-0 text-primary" />
        <span className="truncate">{name ? t("team.space.badge", { name }) : t("team.space.badge", { name: "…" })}</span>
      </span>
      <span className="flex-1" />
      <Link href={communityHref(communityId, "spaces")} data-team-open-page className={buttonClassName({ size: "sm", variant: "outline" })}>
        {t("team.space.openTeam")}
      </Link>
      {share.state === "sent" && <span role="status" className="text-caption text-success">{t("team.share.sent")}</span>}
      {share.state === "failed" && <span role="alert" className="text-caption text-danger">{t("team.share.failed")}</span>}
      <Button type="button" size="sm" variant="outline" disabled={share.state === "sending"} onClick={() => void share.send()} data-team-share-chat>
        {share.state === "sending" ? t("team.share.sending") : t("team.share.button")}
      </Button>
      <Link href={communityChatHref(communityId)} data-team-open-chat className={buttonClassName({ size: "sm", variant: "outline" })}>
        <MessagesSquare size={14} aria-hidden />
        {t("team.space.openChat")}
      </Link>
    </div>
  );
}
