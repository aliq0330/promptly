"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { FileText } from "@/components/icons/file-text";
import { Folder } from "@/components/icons/folder";
import { Megaphone } from "@/components/icons/megaphone";
import { Search } from "@/components/icons/search";
import { Users } from "@/components/icons/users";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListControlRow } from "@/features/content/list-control-row";
import type { SectionMenuItem } from "@/features/content/section-menu";
import { MuteCard } from "@/features/teams/mute-card";
import { NewProjectChannelDialog } from "@/features/teams/project-channel-dialog";
import { useChannelPreviews, useMyProjectRole, useTeamChannelList, useTeamMutes, useTeamSummary } from "@/features/teams/team-chat-data";
import { TeamMark } from "@/features/teams/team-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { matchesHubFilter, matchesHubQuery, pinnedFirst, type HubFilter } from "@/lib/messages-hub";
import { fetchProject, type ProjectDetail } from "@/lib/supabase/team-projects";
import { addProjectChannel, deleteTeamChannel, setChannelNotify, setTeamMute, type TeamActionError, type TeamChannel } from "@/lib/supabase/teams";
import { channelKind, groupTeamChannels, teamHubHref, visibleUnread, type HubProject } from "@/lib/team-chat";
import { teamLink, teamRoleCan } from "@/lib/teams";
import { isProjectKey, markChannelRead, projectIdOfKey, projectKey } from "./hub-actions";
import { HubAddButton, HubBody, HubEmptyNote, HubFrame, HubHeader, HubRow, HubSection, HubTile, HubTopLink } from "./hub-parts";
import { useHubSelection, type HubBulkActions } from "./hub-selection";
import { useRealMessages } from "./real-messages-provider";
import { InlineAlert } from "@/components/ui/inline-alert";

const channelHref = (channel: { id: string }) => `/messages/local?id=${channel.id}`;
const TAG_CLASS = "shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-micro font-bold uppercase tracking-[0.04em] text-text-muted";

/**
 * Mesajlar'dan açılan EKİP kanal listesi (docs/history/369-*, 381-*): ekibin kanalları ve projeleri sohbet listesinin YERİNE açılır (bilgisayarda sol sütun, telefonda sayfa)
 * ve sohbet listesiyle aynı davranır: arama, ⋮ menüsü, seçim modu (Sabitle · Okundu · Sessize al · Sil). `projectId` verilirse aynı iskelet PROJE listesi olur.
 * `openId` bilgisayarda sağ bölmede açık sohbettir (satır vurgulanır, ekip ↔ proje geçişinde korunur).
 */
export function TeamHubView({ teamId, projectId, embedded = false, openId = null }: { teamId: string; projectId: string | null; embedded?: boolean; openId?: string | null }) {
  return projectId ? <ProjectHub teamId={teamId} projectId={projectId} embedded={embedded} openId={openId} /> : <TeamHub teamId={teamId} embedded={embedded} openId={openId} />;
}

function previewOf(previews: Map<string, { text: string; at: string }>, channel: TeamChannel, fallback: string) {
  return previews.get(channel.id)?.text ?? fallback;
}

const mutedScopeOf = (channel: TeamChannel) => channel.muteScope ?? (channel.muted ? "channel" : null);

/** Süzgeç menüsü satırları (Tümü · Okunmamış · Sessize alınanlar) — adı görünüme göre değişir. */
function useFilterItems(allLabel: string): SectionMenuItem<HubFilter>[] {
  const { t } = useTranslation();
  return [
    { key: "all", label: allLabel },
    { key: "unread", label: t("th.filter.unread") },
    { key: "muted", label: t("th.filter.muted") },
  ];
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <label className="relative mb-3 block px-4">
      <span className="sr-only">{label}</span>
      <Search size={16} className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        autoFocus
        data-hub-search
        className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-small text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function TeamHub({ teamId, embedded, openId }: { teamId: string; embedded: boolean; openId: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { conversations, pinConversation, patchConversation } = useRealMessages();
  const summary = useTeamSummary(teamId);
  const { channels, loaded, reload } = useTeamChannelList(teamId);
  // Sayfa her açıldığında okunmamış sayıları ve sessizlik kaynakları taze okunur (modül önbelleği yalnız ilk boyama içindir).
  useEffect(() => {
    reload();
  }, [reload]);
  const mutes = useTeamMutes(teamId, reload);
  const groups = useMemo(() => groupTeamChannels(channels), [channels]);
  const previews = useChannelPreviews(channels.map((channel) => channel.id));
  const noMessages = t("messages.noMessagesYetShort");
  const [filter, setFilter] = useState<HubFilter>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const filterItems = useFilterItems(t("th.filter.channels"));

  const pinnedIds = useMemo(() => new Set(conversations.filter((conversation) => conversation.pinnedAt).map((conversation) => conversation.id)), [conversations]);
  const channelById = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels]);
  const projectById = useMemo(() => new Map(groups.projects.map((project) => [project.projectId, project])), [groups.projects]);

  const manage = teamRoleCan(summary?.myRole, "manage_channels");
  const projectSubtitle = (project: HubProject<TeamChannel>) => {
    if (project.channels.length === 1) return previewOf(previews, project.channels[0], noMessages);
    return project.channels.map((channel) => (channelKind(channel) === "main" ? t("th.mainChat") : (channel.fileTitle ?? channel.name))).join(", ");
  };

  const channelRow = (channel: TeamChannel) => ({
    channel,
    unread: visibleUnread(channel),
    muted: mutedScopeOf(channel) !== null,
    text: previewOf(previews, channel, channel.description || noMessages),
  });
  const channelRows = pinnedFirst(groups.teamChannels.map(channelRow), (row) => pinnedIds.has(row.channel.id)).filter(
    (row) => matchesHubFilter(filter, row) && matchesHubQuery(query, row.channel.name, row.text),
  );
  const projectRows = groups.projects
    .map((project) => ({ project, unread: project.unread, muted: project.muteScope !== null || mutes.isProjectMuted(project.projectId), text: projectSubtitle(project) }))
    .filter((row) => matchesHubFilter(filter, row) && matchesHubQuery(query, row.project.title, row.text));
  const sortedProjects = pinnedFirst(projectRows, (row) => row.project.channels.every((channel) => pinnedIds.has(channel.id)));

  const targetIds = (key: string): TeamChannel[] => (isProjectKey(key) ? (projectById.get(projectIdOfKey(key))?.channels ?? []) : [channelById.get(key)].filter((channel): channel is TeamChannel => Boolean(channel)));
  const actions: HubBulkActions = {
    keys: [...channelRows.map((row) => row.channel.id), ...sortedProjects.map((row) => projectKey(row.project.projectId))],
    unreadKeys: [...channelRows.filter((row) => row.unread > 0 && !row.muted).map((row) => row.channel.id), ...sortedProjects.filter((row) => row.unread > 0 && !row.muted).map((row) => projectKey(row.project.projectId))],
    isPinned: (key) => {
      const list = targetIds(key);
      return list.length > 0 && list.every((channel) => pinnedIds.has(channel.id));
    },
    isMuted: (key) => {
      if (isProjectKey(key)) return mutes.isProjectMuted(projectIdOfKey(key)) || (projectById.get(projectIdOfKey(key))?.muteScope ?? null) !== null;
      const channel = channelById.get(key);
      return channel ? mutedScopeOf(channel) !== null : false;
    },
    canRemove: (key) => {
      const channel = isProjectKey(key) ? undefined : channelById.get(key);
      return Boolean(manage && channel && !channel.isDefault && !channel.projectId);
    },
    pin: async (key, pinned) => {
      for (const channel of targetIds(key)) await pinConversation(channel.id, pinned);
    },
    read: async (key) => {
      for (const channel of targetIds(key)) await markChannelRead(channel, patchConversation, previews.get(channel.id)?.at);
      reload();
    },
    mute: async (key, muted) => {
      if (isProjectKey(key)) await setTeamMute(teamId, projectIdOfKey(key), muted);
      else await setChannelNotify(key, muted ? "none" : null);
      reload();
    },
    remove: manage
      ? async (key) => {
          await deleteTeamChannel(key);
          reload();
          if (openId === key) router.replace(teamHubHref(teamId));
        }
      : undefined,
  };
  const selection = useHubSelection(actions, { word: (keys) => (keys.some(isProjectKey) ? "item" : "channel"), deleteBody: t("tm.chan.deleteBody") });

  if (loaded && !summary && channels.length === 0) return <EmptyState icon={Users} title={t("th.notFound")} />;

  const searchShown = searchOpen || query.trim() !== "";
  const noRows = loaded && channelRows.length === 0 && sortedProjects.length === 0;
  return (
    <HubFrame kind="team" embedded={embedded}>
      {selection.selecting ? (
        <div className="px-4 pt-3">{selection.header(embedded)}</div>
      ) : (
        <>
          <HubHeader
            backHref="/messages"
            backLabel={t("header.messagesAriaLabel")}
            topRight={
              summary && (
                <HubTopLink href={teamLink(summary.slug, "projects")} label={t("th.teamPage")} dataAttr="data-hub-team-page">
                  <ArrowUpRight size={20} aria-hidden />
                </HubTopLink>
              )
            }
            media={<TeamMark name={summary?.name ?? "…"} tone={summary?.tone} size={56} className="rounded-lg" />}
            title={summary?.name ?? "…"}
            meta={summary ? t("th.team.meta", { members: t("tm.chat.memberCount", { count: summary.memberCount }) }) : ""}
            muteCard={<MuteCard compact scope="team" muted={mutes.teamMuted} busy={mutes.busy || !mutes.loaded} error={mutes.error} onToggle={(next) => void mutes.setTeamMuted(next)} />}
          />
          <div className="mb-3 px-4">
            <ListControlRow
              menu={{ items: filterItems, active: filter, onChange: setFilter, ariaLabel: t("th.filter.aria"), title: t("th.channels") }}
              search={{ open: searchShown, onToggle: () => (searchShown ? (setQuery(""), setSearchOpen(false)) : setSearchOpen(true)), label: t("th.search.channels") }}
              trailing={
                <>
                  {selection.moreMenu}
                  {manage && summary && <HubAddButton href={teamLink(summary.slug, "chat", { new: "1" })} label={t("th.addChannel")} dataAttr="data-hub-add-channel" />}
                </>
              }
            />
          </div>
          {searchShown && <SearchBox value={query} onChange={setQuery} label={t("th.search.channels")} />}
        </>
      )}
      {selection.error && (
        <InlineAlert className="mx-4 mb-3">
          {selection.error}
        </InlineAlert>
      )}
      <HubBody embedded={embedded} selecting={selection.selecting}>
        {(!loaded || channelRows.length > 0 || filter === "all") && (
          <HubSection title={t("th.channels")} testId="hub-channels">
            {!loaded && <p className="px-4 py-6 text-small text-text-muted">{t("common.loading")}</p>}
            {channelRows.map(({ channel, unread, text }) => {
              const announce = channel.postingPolicy === "admins" && !channel.isDefault;
              return (
                <HubRow
                  key={channel.id}
                  testKey={channel.name}
                  href={channelHref(channel)}
                  tile={announce ? <HubTile tone="success"><Megaphone size={20} /></HubTile> : <HubTile tone={channel.isDefault ? "primary" : "plain"}>#</HubTile>}
                  title={channel.name}
                  tags={channel.isDefault ? <span className={TAG_CLASS}>{t("th.default")}</span> : undefined}
                  muteScope={mutedScopeOf(channel)}
                  at={previews.get(channel.id)?.at ?? channel.lastMessageAt}
                  subtitle={text}
                  unread={unread}
                  pinned={pinnedIds.has(channel.id)}
                  active={openId === channel.id}
                  selection={selection.rowSelection(channel.id)}
                />
              );
            })}
          </HubSection>
        )}
        {sortedProjects.length > 0 && (
          <HubSection title={t("th.projects")} testId="hub-projects">
            {sortedProjects.map(({ project, text }) => (
              <HubRow
                key={project.projectId}
                testKey={project.title}
                href={teamHubHref(teamId, project.projectId, openId)}
                tile={<HubTile tone="primary" square><Folder size={20} /></HubTile>}
                title={project.title}
                muteScope={project.muteScope ?? (mutes.isProjectMuted(project.projectId) ? "project" : null)}
                at={project.lastMessageAt}
                subtitle={text}
                unread={project.unread}
                pinned={project.channels.every((channel) => pinnedIds.has(channel.id))}
                chevron
                selection={selection.rowSelection(projectKey(project.projectId))}
              />
            ))}
          </HubSection>
        )}
        {noRows && (filter !== "all" || query.trim() !== "") && <HubEmptyNote>{t("th.filter.empty")}</HubEmptyNote>}
        {selection.selecting && embedded && selection.bar(true)}
      </HubBody>
      {selection.selecting && !embedded && selection.bar(false)}
      {selection.dialogs}
    </HubFrame>
  );
}

function ProjectHub({ teamId, projectId, embedded, openId }: { teamId: string; projectId: string; embedded: boolean; openId: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { conversations, pinConversation, patchConversation } = useRealMessages();
  const summary = useTeamSummary(teamId);
  const { channels, loaded, reload } = useTeamChannelList(teamId);
  useEffect(() => {
    reload();
  }, [reload]);
  const mutes = useTeamMutes(teamId, reload);
  const [detail, setDetail] = useState<ProjectDetail | null | undefined>(undefined);
  const loadDetail = useCallback(() => {
    void fetchProject(projectId).then(setDetail, () => setDetail(null));
  }, [projectId]);
  useEffect(loadDetail, [loadDetail]);
  const [dialog, setDialog] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HubFilter>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const filterItems = useFilterItems(t("th.filter.chats"));
  const myProjectRole = useMyProjectRole(projectId);

  const project = useMemo(() => groupTeamChannels(channels).projects.find((entry) => entry.projectId === projectId) ?? null, [channels, projectId]);
  const previews = useChannelPreviews((project?.channels ?? []).map((channel) => channel.id));
  const noMessages = t("messages.noMessagesYetShort");
  const lead = (detail?.myRole ?? myProjectRole) === "lead";
  const filesWithChat = new Set((project?.channels ?? []).map((channel) => channel.fileId).filter(Boolean));
  const filesWithoutChat = (detail?.files ?? []).filter((file) => !filesWithChat.has(file.id));
  const pinnedIds = useMemo(() => new Set(conversations.filter((conversation) => conversation.pinnedAt).map((conversation) => conversation.id)), [conversations]);

  const rows = pinnedFirst(
    (project?.channels ?? []).map((channel) => ({ channel, unread: visibleUnread(channel), muted: mutedScopeOf(channel) !== null, text: previewOf(previews, channel, channel.description || noMessages) })),
    (row) => pinnedIds.has(row.channel.id),
  ).filter((row) => {
    const kind = channelKind(row.channel);
    const label = kind === "main" ? t("th.mainChat") : kind === "file" ? (row.channel.fileTitle ?? row.channel.name) : row.channel.name;
    return matchesHubFilter(filter, row) && matchesHubQuery(query, label, row.text);
  });
  const channelById = useMemo(() => new Map((project?.channels ?? []).map((channel) => [channel.id, channel])), [project]);

  const actions: HubBulkActions = {
    keys: rows.map((row) => row.channel.id),
    unreadKeys: rows.filter((row) => row.unread > 0 && !row.muted).map((row) => row.channel.id),
    isPinned: (key) => pinnedIds.has(key),
    isMuted: (key) => {
      const channel = channelById.get(key);
      return channel ? mutedScopeOf(channel) !== null : false;
    },
    canRemove: (key) => {
      const channel = channelById.get(key);
      return Boolean(lead && channel && !channel.isDefault && channel.projectMain !== true);
    },
    pin: async (key, pinned) => pinConversation(key, pinned),
    read: async (key) => {
      const channel = channelById.get(key);
      if (channel) await markChannelRead(channel, patchConversation, previews.get(key)?.at);
      reload();
    },
    mute: async (key, muted) => {
      await setChannelNotify(key, muted ? "none" : null);
      reload();
    },
    remove: lead
      ? async (key) => {
          await deleteTeamChannel(key);
          reload();
          if (openId === key) router.replace(teamHubHref(teamId, projectId));
        }
      : undefined,
  };
  const selection = useHubSelection(actions, { word: () => "chat", deleteBody: t("tm.chan.deleteBody") });

  if (detail === null || (loaded && !project && detail === undefined && channels.length === 0)) return <EmptyState icon={Users} title={t("th.project.notFound")} />;

  const title = detail?.project.title ?? project?.title ?? "…";
  const createFileChat = async (fileId: string) => {
    setBusyFile(fileId);
    setError(null);
    try {
      await addProjectChannel(projectId, { file: fileId });
      reload();
      loadDetail();
    } catch (e) {
      setError((e as TeamActionError).message);
    } finally {
      setBusyFile(null);
    }
  };
  const searchShown = searchOpen || query.trim() !== "";
  return (
    <HubFrame kind="project" embedded={embedded}>
      {selection.selecting ? (
        <div className="px-4 pt-3">{selection.header(embedded)}</div>
      ) : (
        <>
          <HubHeader
            backHref={teamHubHref(teamId, null, openId)}
            backLabel={summary?.name ?? t("th.back.team")}
            topRight={
              summary && (
                <HubTopLink href={teamLink(summary.slug, "projects", { project: projectId })} label={t("th.openProject")} dataAttr="data-hub-open-project">
                  <ArrowUpRight size={20} aria-hidden />
                </HubTopLink>
              )
            }
            media={<HubTile tone="primary" square><Folder size={26} /></HubTile>}
            title={title}
            meta={t("th.project.meta", { team: summary?.name ?? "", members: t("tm.chat.memberCount", { count: detail?.people.length ?? 0 }) })}
            muteCard={
              <MuteCard
                compact
                scope="project"
                muted={mutes.isProjectMuted(projectId)}
                teamMuted={mutes.teamMuted}
                busy={mutes.busy || !mutes.loaded}
                error={mutes.error}
                onToggle={(next) => void mutes.setProjectMuted(projectId, next)}
              />
            }
          />
          <div className="mb-3 px-4">
            <ListControlRow
              menu={{ items: filterItems, active: filter, onChange: setFilter, ariaLabel: t("th.filter.aria"), title: t("th.project.chats") }}
              search={{ open: searchShown, onToggle: () => (searchShown ? (setQuery(""), setSearchOpen(false)) : setSearchOpen(true)), label: t("th.search.chats") }}
              trailing={
                <>
                  {selection.moreMenu}
                  {lead && !detail?.project.archivedAt && <HubAddButton onClick={() => setDialog(true)} label={t("th.addChannel")} dataAttr="data-hub-add-channel" />}
                </>
              }
            />
          </div>
          {searchShown && <SearchBox value={query} onChange={setQuery} label={t("th.search.chats")} />}
        </>
      )}
      {selection.error && (
        <InlineAlert className="mx-4 mb-3">
          {selection.error}
        </InlineAlert>
      )}
      <HubBody embedded={embedded} selecting={selection.selecting}>
        <HubSection title={t("th.project.chats")} testId="hub-project-chats">
          {!loaded && <p className="px-4 py-6 text-small text-text-muted">{t("common.loading")}</p>}
          {rows.map(({ channel, unread, text }) => {
            const kind = channelKind(channel);
            return (
              <HubRow
                key={channel.id}
                testKey={channel.name}
                href={channelHref(channel)}
                tile={kind === "file" ? <HubTile><FileText size={20} /></HubTile> : <HubTile tone={kind === "main" ? "primary" : "plain"}>#</HubTile>}
                title={kind === "main" ? t("th.mainChat") : kind === "file" ? (channel.fileTitle ?? channel.name) : channel.name}
                tags={kind === "main" || kind === "file" ? <span className={TAG_CLASS}>{t(kind === "main" ? "th.tag.main" : "th.tag.file")}</span> : undefined}
                muteScope={mutedScopeOf(channel)}
                at={previews.get(channel.id)?.at ?? channel.lastMessageAt}
                subtitle={text}
                unread={unread}
                pinned={pinnedIds.has(channel.id)}
                active={openId === channel.id}
                selection={selection.rowSelection(channel.id)}
              />
            );
          })}
        </HubSection>

        {loaded && rows.length === 0 && (filter !== "all" || query.trim() !== "") && <HubEmptyNote>{t("th.filter.empty")}</HubEmptyNote>}

        {lead && filesWithoutChat.length > 0 && (
          <HubSection title={t("th.project.filesNoChat")} hint={t("th.project.filesNoChatHint")} testId="hub-files-no-chat">
            {filesWithoutChat.map((file) => (
              <HubRow
                key={file.id}
                testKey={`file:${file.title}`}
                tile={<HubTile><FileText size={20} /></HubTile>}
                title={file.title}
                subtitle={t("th.file.items", { count: file.itemCount })}
                trailing={
                  selection.selecting ? undefined : (
                    <Button type="button" size="sm" variant="secondary" disabled={busyFile === file.id} onClick={() => void createFileChat(file.id)} data-hub-create-file-chat={file.id}>
                      {t("th.file.createChat")}
                    </Button>
                  )
                }
              />
            ))}
            {error && (
              <p role="alert" className="px-4 pt-1 text-caption text-danger">
                {error}
              </p>
            )}
          </HubSection>
        )}
        {selection.selecting && embedded && selection.bar(true)}
      </HubBody>
      {selection.selecting && !embedded && selection.bar(false)}
      {selection.dialogs}
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
    </HubFrame>
  );
}
