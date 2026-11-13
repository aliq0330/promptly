"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText } from "@/components/icons/file-text";
import { Folder } from "@/components/icons/folder";
import { Lock } from "@/components/icons/lock";
import { Megaphone } from "@/components/icons/megaphone";
import { Plus } from "@/components/icons/plus";
import { Search } from "@/components/icons/search";
import { Users } from "@/components/icons/users";
import { EmptyState } from "@/components/ui/empty-state";
import { NewProjectChannelDialog } from "@/features/teams/project-channel-dialog";
import { useChannelPreviews, useMyProjectRole, useTeamChannelList, useTeamSummary } from "@/features/teams/team-chat-data";
import { can } from "@/lib/chat-groups";
import { pickRoom, readLastRoomId } from "@/lib/community-rooms";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import { matchesHubQuery, pinnedFirst } from "@/lib/messages-hub";
import { fetchProject, type ProjectDetail } from "@/lib/supabase/team-projects";
import type { TeamChannel } from "@/lib/supabase/teams";
import { channelKind, communityHubHref, groupTeamChannels, teamHubHref, visibleUnread } from "@/lib/team-chat";
import { teamLink, teamRoleCan } from "@/lib/teams";
import { DockHeader, DOCK_ICON_BUTTON } from "./dock-header";
import { HubEmptyNote, HubRow, HubSection, HubTile } from "./hub-parts";
import { useMessageDock } from "./message-dock-provider";
import { useRealMessages } from "./real-messages-provider";
import { RoomFormModal } from "./rooms/room-form-modal";
import { RoomIconTile } from "./rooms/room-icon";
import { useCommunityRooms } from "./rooms/use-community-rooms";

const TAG_CLASS = "shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-text-muted";
const mutedScopeOf = (channel: TeamChannel) => channel.muteScope ?? (channel.muted ? "channel" : null);

/** Dock'taki kanal/oda listesinin satırı (arama bunun adına ve önizlemesine bakar). */
interface DockRow {
  key: string;
  title: string;
  text: string;
  node: ReactNode;
}
interface DockSection {
  title: string;
  hint?: string;
  testId: string;
  rows: DockRow[];
}

/**
 * Mesajlar dock'unda ekip / proje / topluluk KANAL LİSTESİ (docs/history/382-*): Mesajlar listesinin yerine panelin içinde açılır ve onun kadar sadedir —
 * başlık, arama kutusu, düz satırlar (kontrol satırı, çip, seçim modu, sessize alma kartı yok). Satır sayfaya gitmez, sohbet panelde açılır; geri bir üst seviyeye
 * (proje → ekip → Mesajlar) döner. Sayfadaki liste (`team-hub-view`, `community-hub-view`) AYNI satırları ve aynı veriyi kullanır.
 */
function DockChannelList({
  title,
  subtitle,
  onBack,
  onExpand,
  searchLabel,
  add,
  sections,
  loading,
  extra,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  onExpand: () => void;
  searchLabel: string;
  /** Yetkiliye "+" (kanal / oda ekle). */
  add?: { label: string; onClick: () => void; dataAttr: string };
  sections: DockSection[];
  loading: boolean;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  const dock = useMessageDock();
  const [query, setQuery] = useState("");
  const shown = sections
    .map((section) => ({ ...section, rows: section.rows.filter((row) => matchesHubQuery(query, row.title, row.text)) }))
    .filter((section) => section.rows.length > 0);
  const searching = query.trim() !== "";
  return (
    <>
      <DockHeader
        onBack={onBack}
        actions={
          add && (
            <button type="button" onClick={add.onClick} aria-label={add.label} title={add.label} {...{ [add.dataAttr]: "" }} className={DOCK_ICON_BUTTON}>
              <Plus size={19} aria-hidden />
            </button>
          )
        }
        onExpand={onExpand}
        expandLabel={t("dock.openPage")}
        onMinimize={dock.minimize}
      >
        <span className="min-w-0 pl-1" data-dock-hub-title="">
          <span className="block truncate font-display text-[1.0625rem] font-extrabold leading-tight tracking-[-0.02em] text-text">{title}</span>
          <span className="block truncate text-caption text-text-muted">{subtitle}</span>
        </span>
      </DockHeader>
      <label className="relative mx-3 mt-3 block shrink-0">
        <span className="sr-only">{searchLabel}</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchLabel}
          data-dock-search=""
          className="h-10 w-full rounded-full border border-border-soft bg-surface-soft pl-10 pr-3 text-small text-text transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto pt-2" data-dock-hub="">
        {loading && <p className="px-4 py-6 text-small text-text-muted">{t("common.loading")}</p>}
        {shown.map((section) => (
          <HubSection key={section.testId} title={section.title} hint={searching ? undefined : section.hint} testId={section.testId}>
            {section.rows.map((row) => (
              <div key={row.key}>{row.node}</div>
            ))}
          </HubSection>
        ))}
        {!loading && searching && shown.length === 0 && <HubEmptyNote>{t("th.filter.empty")}</HubEmptyNote>}
        {extra}
      </div>
    </>
  );
}

/** Dock görünümü `team` / `community`: hangi liste açılacağını seçer. */
export function DockHubView({ view }: { view: { kind: "team"; teamId: string; projectId: string | null } | { kind: "community"; communityId: string } }) {
  return view.kind === "community" ? (
    <DockCommunityList key={view.communityId} communityId={view.communityId} />
  ) : view.projectId ? (
    <DockProjectList key={`${view.teamId}:${view.projectId}`} teamId={view.teamId} projectId={view.projectId} />
  ) : (
    <DockTeamList key={view.teamId} teamId={view.teamId} />
  );
}

function DockTeamList({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const dock = useMessageDock();
  const { conversations } = useRealMessages();
  const summary = useTeamSummary(teamId);
  const { channels, loaded, reload } = useTeamChannelList(teamId);
  useEffect(() => {
    reload();
  }, [reload]);
  const groups = useMemo(() => groupTeamChannels(channels), [channels]);
  const previews = useChannelPreviews(channels.map((channel) => channel.id));
  const noMessages = t("messages.noMessagesYetShort");
  const pinnedIds = useMemo(() => new Set(conversations.filter((conversation) => conversation.pinnedAt).map((conversation) => conversation.id)), [conversations]);
  const manage = teamRoleCan(summary?.myRole, "manage_channels");

  if (loaded && !summary && channels.length === 0) {
    return (
      <>
        <DockHeader onBack={() => dock.setView({ kind: "list" })} onMinimize={dock.minimize}>
          <span className="pl-1" />
        </DockHeader>
        <EmptyState icon={Users} title={t("th.notFound")} className="m-3" compact />
      </>
    );
  }

  const channelRows: DockRow[] = pinnedFirst(groups.teamChannels, (channel) => pinnedIds.has(channel.id)).map((channel) => {
    const announce = channel.postingPolicy === "admins" && !channel.isDefault;
    const text = previews.get(channel.id)?.text ?? (channel.description || noMessages);
    return {
      key: channel.id,
      title: channel.name,
      text,
      node: (
        <HubRow
          testKey={channel.name}
          onOpen={() => dock.openChat(channel.id)}
          tile={announce ? <HubTile tone="success"><Megaphone size={20} /></HubTile> : <HubTile tone={channel.isDefault ? "primary" : "plain"}>#</HubTile>}
          title={channel.name}
          tags={channel.isDefault ? <span className={TAG_CLASS}>{t("th.default")}</span> : undefined}
          muteScope={mutedScopeOf(channel)}
          at={previews.get(channel.id)?.at ?? channel.lastMessageAt}
          subtitle={text}
          unread={visibleUnread(channel)}
          pinned={pinnedIds.has(channel.id)}
        />
      ),
    };
  });
  const projectRows: DockRow[] = groups.projects.map((project) => {
    const text =
      project.channels.length === 1
        ? (previews.get(project.channels[0].id)?.text ?? noMessages)
        : project.channels.map((channel) => (channelKind(channel) === "main" ? t("th.mainChat") : (channel.fileTitle ?? channel.name))).join(", ");
    return {
      key: project.projectId,
      title: project.title,
      text,
      node: (
        <HubRow
          testKey={project.title}
          onOpen={() => dock.openTeam(teamId, project.projectId)}
          tile={<HubTile tone="primary" square><Folder size={21} /></HubTile>}
          title={project.title}
          muteScope={project.muteScope}
          at={project.lastMessageAt}
          subtitle={text}
          unread={project.unread}
          chevron
        />
      ),
    };
  });
  const sections: DockSection[] = [
    { title: t("th.channels"), testId: "hub-channels", rows: channelRows },
    ...(projectRows.length > 0 ? [{ title: t("th.projects"), testId: "hub-projects", rows: projectRows }] : []),
  ];
  return (
    <DockChannelList
      title={summary?.name ?? "…"}
      subtitle={summary ? t("th.team.meta", { members: t("tm.chat.memberCount", { count: summary.memberCount }) }) : ""}
      onBack={() => dock.setView({ kind: "list" })}
      onExpand={() => {
        dock.minimize();
        router.push(teamHubHref(teamId));
      }}
      searchLabel={t("th.search.channels")}
      add={
        manage && summary
          ? {
              label: t("th.addChannel"),
              dataAttr: "data-dock-add",
              onClick: () => {
                dock.minimize();
                router.push(teamLink(summary.slug, "chat", { new: "1" }));
              },
            }
          : undefined
      }
      sections={sections}
      loading={!loaded}
    />
  );
}

function DockProjectList({ teamId, projectId }: { teamId: string; projectId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const dock = useMessageDock();
  const { conversations } = useRealMessages();
  const summary = useTeamSummary(teamId);
  const { channels, loaded, reload } = useTeamChannelList(teamId);
  useEffect(() => {
    reload();
  }, [reload]);
  const [detail, setDetail] = useState<ProjectDetail | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void fetchProject(projectId).then(
      (next) => !cancelled && setDetail(next),
      () => !cancelled && setDetail(null),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  const myProjectRole = useMyProjectRole(projectId);
  const [dialog, setDialog] = useState(false);
  const project = useMemo(() => groupTeamChannels(channels).projects.find((entry) => entry.projectId === projectId) ?? null, [channels, projectId]);
  const previews = useChannelPreviews((project?.channels ?? []).map((channel) => channel.id));
  const noMessages = t("messages.noMessagesYetShort");
  const pinnedIds = useMemo(() => new Set(conversations.filter((conversation) => conversation.pinnedAt).map((conversation) => conversation.id)), [conversations]);
  const lead = (detail?.myRole ?? myProjectRole) === "lead";
  const backToTeam = () => dock.openTeam(teamId, null);

  if (detail === null || (loaded && !project && detail === undefined && channels.length === 0)) {
    return (
      <>
        <DockHeader onBack={backToTeam} onMinimize={dock.minimize}>
          <span className="pl-1" />
        </DockHeader>
        <EmptyState icon={Users} title={t("th.project.notFound")} className="m-3" compact />
      </>
    );
  }

  const chatRows: DockRow[] = pinnedFirst(project?.channels ?? [], (channel) => pinnedIds.has(channel.id)).map((channel) => {
    const kind = channelKind(channel);
    const rowTitle = kind === "main" ? t("th.mainChat") : kind === "file" ? (channel.fileTitle ?? channel.name) : channel.name;
    const text = previews.get(channel.id)?.text ?? (channel.description || noMessages);
    return {
      key: channel.id,
      title: rowTitle,
      text,
      node: (
        <HubRow
          testKey={channel.name}
          onOpen={() => dock.openChat(channel.id)}
          tile={kind === "file" ? <HubTile><FileText size={20} /></HubTile> : <HubTile tone={kind === "main" ? "primary" : "plain"}>#</HubTile>}
          title={rowTitle}
          tags={kind === "main" || kind === "file" ? <span className={TAG_CLASS}>{t(kind === "main" ? "th.tag.main" : "th.tag.file")}</span> : undefined}
          muteScope={mutedScopeOf(channel)}
          at={previews.get(channel.id)?.at ?? channel.lastMessageAt}
          subtitle={text}
          unread={visibleUnread(channel)}
          pinned={pinnedIds.has(channel.id)}
        />
      ),
    };
  });
  const sections: DockSection[] = [{ title: t("th.project.chats"), testId: "hub-project-chats", rows: chatRows }];
  const title = detail?.project.title ?? project?.title ?? "…";
  return (
    <>
      <DockChannelList
        title={title}
        subtitle={t("th.project.meta", { team: summary?.name ?? "", members: t("tm.chat.memberCount", { count: detail?.people.length ?? 0 }) })}
        onBack={backToTeam}
        onExpand={() => {
          dock.minimize();
          router.push(teamHubHref(teamId, projectId));
        }}
        searchLabel={t("th.search.chats")}
        add={lead && !detail?.project.archivedAt ? { label: t("th.addChannel"), dataAttr: "data-dock-add", onClick: () => setDialog(true) } : undefined}
        sections={sections}
        loading={!loaded}
      />
      {dialog && (
        <NewProjectChannelDialog
          projectId={projectId}
          onClose={() => setDialog(false)}
          onCreated={() => {
            setDialog(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function DockCommunityList({ communityId }: { communityId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const dock = useMessageDock();
  const { conversations } = useRealMessages();
  const group = conversations.find((entry) => entry.id === communityId)?.group ?? null;
  const roomsState = useCommunityRooms(communityId);
  const [formOpen, setFormOpen] = useState(false);
  const rooms = useMemo(() => roomsState.rooms.filter((room) => !room.archivedAt), [roomsState.rooms]);
  const activeRoomId = pickRoom(roomsState.rooms, null, readLastRoomId(communityId))?.id ?? null;
  const canManageRooms = group ? can(group.myRole, "manage_rooms", group.rolePermissions) : false;

  if (conversations.length > 0 && !group) {
    return (
      <>
        <DockHeader onBack={() => dock.setView({ kind: "list" })} onMinimize={dock.minimize}>
          <span className="pl-1" />
        </DockHeader>
        <EmptyState icon={Users} title={t("th.community.notFound")} className="m-3" compact />
      </>
    );
  }

  const roomRows: DockRow[] = rooms.map((room) => {
    const readOnly = !room.isDefault && room.postingPolicy === "admins" && !room.canPost;
    return {
      key: room.id,
      title: room.name,
      text: room.description ?? "",
      node: (
        <HubRow
          testKey={room.name}
          onOpen={() => dock.openChat(communityId, room.id)}
          tile={<RoomIconTile icon={room.icon} size={44} />}
          title={room.name}
          tags={room.isDefault ? <span className={TAG_CLASS}>{t("th.default")}</span> : undefined}
          muteScope={room.muted ? "channel" : null}
          at={room.lastMessageAt}
          subtitle={room.description ?? ""}
          unread={room.muted ? 0 : room.unreadCount}
          active={activeRoomId === room.id}
          trailing={room.readPolicy === "staff" || readOnly ? <Lock size={14} className="shrink-0 text-text-muted" aria-hidden /> : undefined}
        />
      ),
    };
  });
  return (
    <>
      <DockChannelList
        title={group?.name ?? "…"}
        subtitle={group ? t("th.community.meta", { members: memberCountText(t, group.memberCount) }) : ""}
        onBack={() => dock.setView({ kind: "list" })}
        onExpand={() => {
          dock.minimize();
          router.push(communityHubHref(communityId));
        }}
        searchLabel={t("th.search.rooms")}
        add={canManageRooms ? { label: t("th.community.addRoom"), dataAttr: "data-dock-add", onClick: () => setFormOpen(true) } : undefined}
        sections={[{ title: t("th.community.rooms"), testId: "hub-rooms", rows: roomRows }]}
        loading={roomsState.loading && rooms.length === 0}
        extra={!roomsState.loading && rooms.length === 0 ? <p className="px-4 py-6 text-small text-text-muted">{t("th.community.noRooms")}</p> : undefined}
      />
      {formOpen && <RoomFormModal communityId={communityId} rooms={roomsState.rooms} onClose={() => setFormOpen(false)} onSaved={() => void roomsState.reload()} />}
    </>
  );
}
