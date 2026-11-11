"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { FileText } from "@/components/icons/file-text";
import { Folder } from "@/components/icons/folder";
import { Megaphone } from "@/components/icons/megaphone";
import { Plus } from "@/components/icons/plus";
import { buttonClassName, Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "@/components/icons/users";
import { MuteCard } from "@/features/teams/mute-card";
import { NewProjectChannelDialog } from "@/features/teams/project-channel-dialog";
import { useChannelPreviews, useTeamChannelList, useTeamMutes, useTeamSummary } from "@/features/teams/team-chat-data";
import { TeamMark } from "@/features/teams/team-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchProject, type ProjectDetail } from "@/lib/supabase/team-projects";
import { addProjectChannel, type TeamActionError, type TeamChannel } from "@/lib/supabase/teams";
import { channelKind, groupTeamChannels, teamHubHref, visibleUnread, type HubProject } from "@/lib/team-chat";
import { teamLink, teamRoleCan } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { HubRow, HubSection, HubShell, HubTile } from "./hub-parts";

const channelHref = (channel: { id: string }) => `/messages/local?id=${channel.id}`;

/**
 * Mesajlar'dan açılan EKİP sayfası (docs/history/369-*, mockup "Ekip sayfası"): ekibin kanalları ve projeleri tek listede, WhatsApp Toplulukları düzeninde.
 * `projectId` verilirse aynı iskelet PROJE sayfası olur (projenin sohbetleri). Kanal çipleri sohbet ekranından kalktı; kanal değiştirmek = bu sayfaya dönmek.
 */
export function TeamHubView({ teamId, projectId }: { teamId: string; projectId: string | null }) {
  return projectId ? <ProjectHub teamId={teamId} projectId={projectId} /> : <TeamHub teamId={teamId} />;
}

function previewOf(previews: Map<string, { text: string; at: string }>, channel: TeamChannel, fallback: string) {
  return previews.get(channel.id)?.text ?? fallback;
}

function TeamHub({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
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

  if (loaded && !summary && channels.length === 0) return <EmptyState icon={Users} title={t("th.notFound")} />;

  const manage = teamRoleCan(summary?.myRole, "manage_channels");
  const projectSubtitle = (project: HubProject<TeamChannel>) => {
    if (project.channels.length === 1) return previewOf(previews, project.channels[0], noMessages);
    return project.channels.map((channel) => (channelKind(channel) === "main" ? t("th.mainChat") : (channel.fileTitle ?? channel.name))).join(", ");
  };

  return (
    <HubShell
      kind="team"
      backHref="/messages"
      topRight={
        summary && (
          <Link href={teamLink(summary.slug, "projects")} data-hub-team-page aria-label={t("th.teamPage")} title={t("th.teamPage")} className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowUpRight size={20} aria-hidden />
          </Link>
        )
      }
      media={<TeamMark name={summary?.name ?? "…"} tone={summary?.tone} size={64} className="rounded-[20px]" />}
      title={summary?.name ?? "…"}
      meta={summary ? t("th.team.meta", { members: t("tm.chat.memberCount", { count: summary.memberCount }) }) : ""}
      footer={
        manage && summary ? (
          <Link href={teamLink(summary.slug, "chat", { new: "1" })} data-hub-add-channel className={cn(buttonClassName({ variant: "primary", size: "lg" }), "w-full")}>
            <Plus size={18} aria-hidden /> {t("th.addChannel")}
          </Link>
        ) : undefined
      }
    >
      <div className="px-4">
        <MuteCard scope="team" muted={mutes.teamMuted} busy={mutes.busy || !mutes.loaded} error={mutes.error} onToggle={(next) => void mutes.setTeamMuted(next)} />
      </div>

      <HubSection title={t("th.channels")} testId="hub-channels">
        {!loaded && <p className="px-4 py-6 text-small text-text-muted">{t("common.loading")}</p>}
        {groups.teamChannels.map((channel) => {
          const announce = channel.postingPolicy === "admins" && !channel.isDefault;
          return (
            <HubRow
              key={channel.id}
              testKey={channel.name}
              href={channelHref(channel)}
              tile={announce ? <HubTile tone="success"><Megaphone size={20} /></HubTile> : <HubTile tone={channel.isDefault ? "primary" : "plain"}>#</HubTile>}
              title={channel.name}
              tags={channel.isDefault ? <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-text-muted">{t("th.default")}</span> : undefined}
              muteScope={channel.muteScope ?? (channel.muted ? "channel" : null)}
              at={previews.get(channel.id)?.at ?? channel.lastMessageAt}
              subtitle={previewOf(previews, channel, channel.description || noMessages)}
              unread={channel.unreadCount}
            />
          );
        })}
      </HubSection>

      {groups.projects.length > 0 && (
        <HubSection title={t("th.projects")} testId="hub-projects">
          {groups.projects.map((project) => (
            <HubRow
              key={project.projectId}
              testKey={project.title}
              href={teamHubHref(teamId, project.projectId)}
              tile={<HubTile tone="primary" square><Folder size={21} /></HubTile>}
              title={project.title}
              muteScope={project.muteScope}
              at={project.lastMessageAt}
              subtitle={projectSubtitle(project)}
              unread={project.unread}
              chevron
            />
          ))}
        </HubSection>
      )}
    </HubShell>
  );
}

function ProjectHub({ teamId, projectId }: { teamId: string; projectId: string }) {
  const { t } = useTranslation();
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

  const project = useMemo(() => groupTeamChannels(channels).projects.find((entry) => entry.projectId === projectId) ?? null, [channels, projectId]);
  const previews = useChannelPreviews((project?.channels ?? []).map((channel) => channel.id));
  const noMessages = t("messages.noMessagesYetShort");
  const lead = detail?.myRole === "lead";
  const filesWithChat = new Set((project?.channels ?? []).map((channel) => channel.fileId).filter(Boolean));
  const filesWithoutChat = (detail?.files ?? []).filter((file) => !filesWithChat.has(file.id));

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

  return (
    <HubShell
      kind="project"
      backHref={teamHubHref(teamId)}
      media={<HubTile tone="primary" square><Folder size={28} /></HubTile>}
      title={title}
      meta={t("th.project.meta", { team: summary?.name ?? "", members: t("tm.chat.memberCount", { count: detail?.people.length ?? 0 }) })}
      footer={
        <>
          {lead && !detail?.project.archivedAt && (
            <Button type="button" onClick={() => setDialog(true)} data-hub-add-channel className="w-full">
              <Plus size={18} aria-hidden /> {t("th.addChannel")}
            </Button>
          )}
          {summary && (
            <Link href={teamLink(summary.slug, "projects", { project: projectId })} data-hub-open-project className={cn(buttonClassName({ variant: "secondary", size: "lg" }), "w-full")}>
              <ArrowUpRight size={18} aria-hidden /> {t("th.openProject")}
            </Link>
          )}
        </>
      }
    >
      <div className="px-4">
        <MuteCard
          scope="project"
          muted={mutes.isProjectMuted(projectId)}
          teamMuted={mutes.teamMuted}
          busy={mutes.busy || !mutes.loaded}
          error={mutes.error}
          onToggle={(next) => void mutes.setProjectMuted(projectId, next)}
        />
      </div>

      <HubSection title={t("th.project.chats")} testId="hub-project-chats">
        {!loaded && <p className="px-4 py-6 text-small text-text-muted">{t("common.loading")}</p>}
        {(project?.channels ?? []).map((channel) => {
          const kind = channelKind(channel);
          return (
            <HubRow
              key={channel.id}
              testKey={channel.name}
              href={channelHref(channel)}
              tile={kind === "file" ? <HubTile><FileText size={20} /></HubTile> : <HubTile tone={kind === "main" ? "primary" : "plain"}>#</HubTile>}
              title={kind === "main" ? t("th.mainChat") : kind === "file" ? (channel.fileTitle ?? channel.name) : channel.name}
              tags={
                kind === "main" || kind === "file" ? (
                  <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-text-muted">{t(kind === "main" ? "th.tag.main" : "th.tag.file")}</span>
                ) : undefined
              }
              muteScope={channel.muteScope ?? (channel.muted ? "channel" : null)}
              at={previews.get(channel.id)?.at ?? channel.lastMessageAt}
              subtitle={previewOf(previews, channel, channel.description || noMessages)}
              unread={visibleUnread(channel)}
            />
          );
        })}
      </HubSection>

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
                <Button type="button" size="sm" variant="secondary" disabled={busyFile === file.id} onClick={() => void createFileChat(file.id)} data-hub-create-file-chat={file.id}>
                  {t("th.file.createChat")}
                </Button>
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
    </HubShell>
  );
}
