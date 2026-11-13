"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Hash } from "@/components/icons/hash";
import { Info } from "@/components/icons/info";
import { Lock } from "@/components/icons/lock";
import { Search } from "@/components/icons/search";
import { InfoCard, InfoIdentity, InfoPanelShell, InfoTile, InfoTiles } from "@/features/messages/info-panel-kit";
import { SegmentedChoice } from "@/features/messages/segmented-choice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { setChannelNotify, type TeamChannel, type TeamSummary } from "@/lib/supabase/teams";
import { channelLabel } from "@/lib/team-chat";
import { teamLink, teamRoleCan } from "@/lib/teams";
import { MuteCard, MuteChip } from "./mute-card";
import { cn, formatUnread } from "@/lib/utils";
import { RoleChip, TeamMark } from "./team-ui";
import { CountBadge } from "@/components/ui/badge";

type NotifyLevel = "all" | "mentions" | "none";

/**
 * Ekip bilgisi (Yön A, mockup "Ekip 3", docs/history/353-*): ekip sohbetinin başlığına dokununca açılan TEK sayfa — eski iki ayrı ekranın (bilgi + kanal listesi) birleşimi.
 * Kimlik, hızlı eylemler (Ekip sayfası · Kanalda ara · Sessize al), kanallar (açık olan işaretli, okunmamış sayılı), bildirim düzeyi ve ekip sayfasına kısa yol.
 * Yönetim işleri (üye, politika, erişim) BURADA DEĞİL ekip sayfasındadır; her işlem sunucuda yeniden yetkilendirilir.
 */
export function TeamInfoModal({
  team,
  summary,
  channels,
  currentChannelId,
  muted,
  muteBusy,
  onToggleMute,
  onClose,
  onSearch,
  onSelectChannel,
  onOpenChannelInfo,
  onChannelsChanged,
}: {
  team: { id: string; slug: string; name: string; tone: string; channelName: string };
  summary: TeamSummary | null;
  channels: TeamChannel[];
  currentChannelId: string;
  muted: boolean;
  muteBusy: boolean;
  onToggleMute: () => void;
  onClose: () => void;
  onSearch: () => void;
  onSelectChannel: (channelId: string) => void;
  onOpenChannelInfo: (channelId: string) => void;
  onChannelsChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberCount = summary?.memberCount ?? 0;
  const canManageChannels = teamRoleCan(summary?.myRole, "manage_channels");
  const levels = useMemo(() => [...new Set(channels.map((channel) => channel.notifyLevel))], [channels]);
  const level: NotifyLevel | null = levels.length === 1 ? levels[0] : null;

  async function applyLevel(next: NotifyLevel) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Bildirim düzeyi kanal başınadır (sunucuda `team_set_channel_notify`); bu anahtar ekibin tüm kanallarına uygular.
      for (const channel of channels) await setChannelNotify(channel.id, next);
      onChannelsChanged();
    } catch (err) {
      console.error("setChannelNotify", err);
      setError(t("tm.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <InfoPanelShell title={t("tm.info.title")} titleId="team-info-title" onClose={onClose} attrs={{ "data-team-info": "" }}>
      <InfoIdentity
        media={<TeamMark name={team.name} tone={team.tone} size={104} className="rounded-[30px]" />}
        name={team.name}
        nameAttr="data-team-info-name"
        sub={
          <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-small">
            <span>{t("tm.info.subtitle", { access: t("tm.header.inviteOnly"), members: t("tm.chat.memberCount", { count: memberCount }) })}</span>
            {summary && <RoleChip role={summary.myRole} />}
          </span>
        }
        description={summary?.description}
      />

      <InfoTiles>
        <InfoTile icon={<ArrowUpRight size={24} />} label={t("tm.info.teamPage")} href={teamLink(team.slug, "chat", { channel: team.channelName })} testId="team-page" attrs={{ "data-info-team-link": "" }} />
        <InfoTile icon={<Search size={24} />} label={t("tm.chan.search")} onClick={onSearch} testId="search" />
      </InfoTiles>

      <div className="px-4">
        <MuteCard scope="team" muted={muted} busy={muteBusy} error={null} onToggle={() => onToggleMute()} />
      </div>

      <InfoCard aria-labelledby="team-info-channels">
        <div className="flex items-center px-4 pb-1 pt-3.5">
          <h3 id="team-info-channels" className="min-w-0 flex-1 font-display text-body font-bold text-text">
            {t("tm.info.channels")}
          </h3>
          {canManageChannels && (
            <Link href={teamLink(team.slug, "chat", { new: "1" })} data-info-add-channel className="text-small font-bold text-primary hover:underline">
              {t("tm.info.addChannel")}
            </Link>
          )}
        </div>
        <div role="list" className="pb-2">
          {channels.map((channel) => {
            const current = channel.id === currentChannelId;
            const unread = !channel.muted && channel.unreadCount > 0 && !current;
            const sub = current
              ? t("tm.info.current")
              : channel.mode === "private"
                ? t("tm.info.privateChannel", { count: channel.memberCount })
                : unread
                  ? t("tm.info.unread", { count: channel.unreadCount })
                  : channel.postingPolicy === "admins"
                    ? t("tm.info.adminsPost")
                    : (channel.description ?? "");
            return (
              <div key={channel.id} role="listitem" className={cn("flex items-center gap-1 pr-2", current && "bg-primary-soft")}>
                <button
                  type="button"
                  onClick={() => onSelectChannel(channel.id)}
                  data-info-channel={channel.name}
                  aria-current={current ? "true" : undefined}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", channel.mode === "private" ? "bg-warning/10 text-warning" : "bg-primary-soft text-primary")} aria-hidden>
                    {channel.mode === "private" ? <Lock size={16} /> : <Hash size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("flex items-center gap-1.5 text-body", current || unread ? "font-bold text-text" : "font-semibold text-text")}>
                      <span className="truncate">{channelLabel(channel)}</span>
                      <MuteChip scope={channel.muteScope ?? (channel.muted ? "channel" : null)} />
                    </span>
                    {sub && <span className={cn("block truncate text-caption", current ? "font-semibold text-primary" : "text-text-muted")}>{sub}</span>}
                  </span>
                  {unread && <CountBadge>{formatUnread(channel.unreadCount)}</CountBadge>}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChannelInfo(channel.id)}
                  aria-label={`${t("tm.info.channelInfo")}: #${channel.name}`}
                  data-info-channel-info={channel.name}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Info size={16} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </InfoCard>

      <InfoCard aria-labelledby="team-info-notify">
        <div className="space-y-2 px-4 py-3.5">
          <h3 id="team-info-notify" className="font-display text-body font-bold text-text">
            {t("tm.info.notifications")}
          </h3>
          <SegmentedChoice<NotifyLevel>
            value={level}
            onChange={(next) => void applyLevel(next)}
            disabled={busy || channels.length === 0}
            ariaLabel={t("tm.info.notifications")}
            testId="team-notify"
            options={[
              { key: "all", label: t("tm.chat.notify.all") },
              { key: "mentions", label: t("tm.chat.notify.mentionsShort") },
              { key: "none", label: t("tm.chat.notify.none") },
            ]}
          />
          <p className="text-caption text-text-muted">{level === null && channels.length > 0 ? t("tm.info.notifyMixed") : t("tm.info.notificationsHint")}</p>
          {error && (
            <p role="alert" className="text-caption text-danger">
              {error}
            </p>
          )}
        </div>
      </InfoCard>

      <Link
        href={teamLink(team.slug, "spaces")}
        data-info-open-team
        className="mx-4 mt-3 flex shrink-0 items-center gap-3 rounded-xl bg-primary-soft px-4 py-3 transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body font-bold text-primary">{t("tm.info.openTeam")}</span>
          <span className="block text-caption text-text-secondary">{t("tm.info.openTeamHint")}</span>
        </span>
        <ArrowUpRight size={20} className="shrink-0 text-primary" aria-hidden />
      </Link>
    </InfoPanelShell>
  );
}
