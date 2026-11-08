"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Briefcase } from "@/components/icons/briefcase";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Share2 } from "@/components/icons/share-2";
import { Button, buttonClassName } from "@/components/ui/button";
import { composeSpaceShareBody } from "@/features/messages/space-share-format";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { TeamMark } from "@/features/teams/team-ui";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { sendMessage } from "@/lib/supabase/messages";
import { fetchMyTeam, listTeamChannels, type TeamChannel, type TeamSummary } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";

/**
 * Ekibe bağlı Space'in üstündeki şerit (docs/history/353-*): ekip adı, Ekip sayfası, Ekip sohbeti ve "Sohbete gönder" (bu Space'i bir kanala başlık + bağlantı
 * bloğu olarak yazar; yeni mesaj şeması yok, sohbet bloğu kartlaştırır). Ekibe üye olmayan (ör. Space'e doğrudan bağlantıyla gelen) için çizilmez.
 */
export function TeamSpaceStrip({ teamId, space }: { teamId: string; space: { id: string; title: string } }) {
  const { t } = useTranslation();
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMyTeam(teamId).then(
      (found) => !cancelled && setTeam(found),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (!team) return null;
  return (
    <div data-testid="team-space-strip" className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-surface-soft px-3 py-2">
      <TeamMark name={team.name} tone={team.tone} size={28} />
      <span className="min-w-0 flex-1 text-small">
        <span className="font-medium">{team.name}</span>
        <span className="text-text-muted"> · {t("tm.strip.label")}</span>
      </span>
      <Link href={teamLink(team.id, "spaces")} data-team-open-page className={buttonClassName({ size: "sm", variant: "outline" })}>
        <Briefcase size={14} aria-hidden />
        {t("tm.strip.teamPage")}
      </Link>
      <Link href={teamLink(team.id, "chat")} data-team-open-chat className={buttonClassName({ size: "sm", variant: "outline" })}>
        <MessagesSquare size={14} aria-hidden />
        {t("tm.card.openChat")}
      </Link>
      <Button type="button" size="sm" onClick={() => setSendOpen(true)} data-team-send-chat>
        <Share2 size={14} aria-hidden />
        {t("tm.strip.send")}
      </Button>
      {sendOpen && <SendToChannelDialog team={team} space={space} onClose={() => setSendOpen(false)} />}
    </div>
  );
}

function SendToChannelDialog({ team, space, onClose }: { team: TeamSummary; space: { id: string; title: string }; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [channels, setChannels] = useState<TeamChannel[] | null>(null);
  const [channel, setChannel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listTeamChannels(team.id).then(
      (rows) => {
        const writable = rows.filter((c) => !c.archivedAt && c.canPost);
        setChannels(writable);
        setChannel(writable.find((c) => c.isDefault)?.id ?? writable[0]?.id ?? "");
      },
      () => setChannels([]),
    );
  }, [team.id]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !channel) return;
    setBusy(true);
    setError(null);
    try {
      await sendMessage(channel, user.id, { body: composeSpaceShareBody(note.trim(), space.title, space.id) });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tm.strip.send")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void send(event)}
      formTestId="team-send-chat-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
          {!done && (
            <Button type="submit" disabled={busy || !channel}>
              {t("tm.strip.sendConfirm")}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {channels && channels.length === 0 && <p className="text-small text-text-muted">{t("tm.strip.noChannel")}</p>}
        {channels && channels.length > 0 && (
          <>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label={t("tm.strip.pick")} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-small">
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  # {c.name}
                </option>
              ))}
            </select>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder={t("tm.strip.note")} aria-label={t("tm.strip.note")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-small" />
          </>
        )}
        {done && <p className="text-small text-success">{t("tm.strip.sent")}</p>}
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}
