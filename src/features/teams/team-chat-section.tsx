"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen } from "@/components/icons/folder-open";
import { Hash } from "@/components/icons/hash";
import { Lock } from "@/components/icons/lock";
import { Plus } from "@/components/icons/plus";
import { Info } from "@/components/icons/info";
import { Search } from "@/components/icons/search";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollRow } from "@/components/ui/scroll-row";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { LocalConversationView, type EmbeddedChatControls } from "@/features/messages/local-conversation-view";
import { PresenceAvatar } from "@/features/presence/presence-ui";
import { useOnlineIds } from "@/features/presence/use-presence";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  archiveTeamChannel,
  createTeamChannel,
  deleteTeamChannel,
  fetchChannelAccess,
  listChannelMembers,
  listTeamChannels,
  listTeamSpaces,
  setChannelAccess,
  updateTeamChannel,
  type AccessEntry,
  type ChannelMember,
  type TeamActionError,
  type TeamChannel,
  type TeamSpaceRow,
} from "@/lib/supabase/teams";
import { fetchProjectChannels } from "@/lib/supabase/team-projects";
import { teamLink } from "@/lib/teams";
import { cn, formatUnread } from "@/lib/utils";
import { AccessEditor } from "./access-editor";
import type { TeamCtx } from "./team-page";
import { PillChoice } from "./team-ui";

/**
 * Sohbet sekmesi (docs/history/353-*): her kanal AYRI bir konuşmadır (`conversations.kind = 'team_channel'`); üyelik ekip rolünden/Space erişiminden
 * sunucuda yansıtılır, bu yüzden kanala dahil olmayan kimse mesajı göremez. Bu görünüm ve Mesajlar'daki "Ekip sohbetleri" listesi AYNI konuşmaya açılır
 * (okundu imleci ve okunmamış sayısı ortaktır).
 */
export function TeamChatSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, can } = ctx;
  const router = useRouter();
  const params = useSearchParams();
  const [channels, setChannels] = useState<TeamChannel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<TeamChannel | null>(null);
  const wanted = params.get("channel");
  const [members, setMembers] = useState<ChannelMember[]>([]);

  const load = useCallback(() => {
    void listTeamChannels(team.id).then(
      (rows) => {
        setChannels(rows);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [team.id]);
  useEffect(load, [load]);
  // Proje sohbetleri (docs/history/362-*): kanal adı proje başlığından üretilmiş kısa addır; listede projenin kendi başlığı görünür.
  const [projectTitles, setProjectTitles] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void fetchProjectChannels(team.id).then(
      (list) => setProjectTitles(new Map(list.map((ref) => [ref.channelId, ref.projectTitle]))),
      () => setProjectTitles(new Map()),
    );
  }, [team.id]);

  const visible = useMemo(() => (channels ?? []).filter((c) => !c.archivedAt), [channels]);
  const archived = useMemo(() => (channels ?? []).filter((c) => c.archivedAt), [channels]);
  const active = visible.find((c) => c.id === wanted || c.name === wanted) ?? visible[0] ?? null;
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void listChannelMembers(activeId).then(
      (rows) => !cancelled && setMembers(rows),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [activeId]);
  const online = useOnlineIds(members.map((m) => m.userId));
  const onlineMembers = members.filter((m) => online.has(m.userId));
  // Telefonda ekip sohbeti Mesajlar'daki TAM EKRAN sohbettir (Yön A, "Ekip 2", docs/history/353-*): burada yalnız kanal listesi vardır,
  // kanala dokunmak sohbeti açar (tek ince başlık + kanal çipleri; geri düğmesi bu sayfaya döner). Masaüstü/tablette sohbet burada gömülü kalır.
  const phone = !useMediaQuery("(min-width: 768px)");
  const select = (channel: TeamChannel) => {
    if (phone) router.push(`/messages/local?id=${channel.id}&from=team`);
    else router.replace(teamLink(team.id, "chat", { channel: channel.name }));
  };
  // `?new=1` (bilgi sayfasındaki "Kanal ekle") ve `?settings=1` (kanal bilgisindeki "Düzenle") ilgili pencereyi adresten açar; kapanınca adresten kalkar.
  const manage = can("manage_channels");
  const newVisible = newOpen || (params.get("new") === "1" && manage);
  const settingsTarget = settingsFor ?? (params.get("settings") === "1" && manage ? active : null);
  const clearRequest = () => router.replace(teamLink(team.id, "chat", wanted ? { channel: wanted } : {}));

  const renderChannel = (channel: TeamChannel) => {
    const current = active?.id === channel.id;
    const unread = channel.unreadCount > 0 && !channel.muted;
    const isProject = channel.mode === "project";
    return (
      <li key={channel.id}>
        <button
          type="button"
          onClick={() => select(channel)}
          data-channel={channel.name}
          data-channel-mode={channel.mode}
          aria-current={current ? "true" : undefined}
          className={cn(
            "flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            current ? "bg-primary-soft font-bold text-primary" : cn("text-text-secondary hover:bg-surface-soft", unread && "font-bold text-text"),
          )}
        >
          {channel.mode === "private" ? <Lock size={14} aria-hidden /> : isProject ? <FolderOpen size={14} aria-hidden /> : <Hash size={14} aria-hidden />}
          <span className="min-w-0 flex-1 truncate">{isProject ? (projectTitles.get(channel.id) ?? channel.name) : channel.name}</span>
          {unread && <span className="rounded-full bg-secondary px-1.5 text-caption font-bold text-white">{formatUnread(channel.unreadCount)}</span>}
        </button>
      </li>
    );
  };

  if (failed) return <EmptyState icon={Hash} title={t("tm.chat.failed")} action={{ label: t("common.retry"), onClick: load }} />;
  if (!channels) return <p className="py-10 text-center text-small text-text-muted">{t("common.loading")}</p>;

  return (
    <section className="grid gap-4 lg:grid-cols-[15.5rem_minmax(0,1fr)]" data-testid="team-chat">
      {/* Masaüstü (Seçenek 1, "çalışma alanı"): solda kanal kartı, sağda sohbet kartı. Tablette kanallar sohbet kartının çip satırındadır; telefonda yalnız bu liste. */}
      <aside
        className="space-y-3 md:max-lg:hidden lg:flex lg:h-[calc(100dvh-20rem)] lg:min-h-[32rem] lg:flex-col lg:space-y-1 lg:rounded-[20px] lg:border lg:border-border-soft lg:bg-surface lg:px-2.5 lg:py-3.5"
        data-testid="team-channel-aside"
      >
        <div className="flex items-center lg:px-2 lg:pb-1.5">
          <h2 className="flex-1 text-label font-semibold uppercase tracking-wide text-text-muted">{t("tm.chat.channels")}</h2>
          {can("manage_channels") && (
            <button type="button" onClick={() => setNewOpen(true)} aria-label={t("tm.chat.newChannel")} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-soft text-text-secondary hover:text-text lg:h-[26px] lg:w-[26px]" data-channel-new>
              <Plus size={16} aria-hidden />
            </button>
          )}
        </div>
        <ul className="space-y-0.5" data-testid="team-channel-list">
          {visible.filter((channel) => channel.mode !== "project").map((channel) => renderChannel(channel))}
        </ul>
        {visible.some((channel) => channel.mode === "project") && (
          <>
            <h3 className="px-3 pt-2 text-caption font-semibold uppercase tracking-wide text-text-muted lg:px-2" data-testid="team-project-channels-heading">
              {t("tp.chat.projects")}
            </h3>
            <ul className="space-y-0.5" data-testid="team-project-channel-list">
              {visible.filter((channel) => channel.mode === "project").map((channel) => renderChannel(channel))}
            </ul>
          </>
        )}
        {archived.length > 0 && can("manage_channels") && (
          <details className="text-caption text-text-muted">
            <summary className="cursor-pointer lg:px-2">{t("tm.chat.archived", { count: archived.length })}</summary>
            <ul className="mt-1 space-y-0.5">
              {archived.map((channel) => (
                <li key={channel.id} className="flex items-center justify-between px-3 py-1">
                  <span className="truncate">#{channel.name}</span>
                  <button type="button" className="text-primary hover:underline" onClick={() => void archiveTeamChannel(channel.id, false).then(load)}>
                    {t("tm.chat.unarchive")}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex-1" />
        <p data-testid="team-online" className="border-t border-border-soft px-2 pt-2.5 text-caption text-text-muted lg:mt-1">
          {t("tm.chat.onlineCount", { count: onlineMembers.length })} · {t("tm.chat.memberCount", { count: team.memberCount })}
        </p>
      </aside>

      {active ? (
        // Telefonda tek bölme: kanal seçilene kadar yalnız liste, seçilince yalnız sohbet (+ geri). Masaüstünde ikisi yan yana.
        <div className="min-w-0 max-md:hidden">
          <ChannelView key={active.id} channel={active} channels={visible} members={members} onSelect={select} onlineCount={onlineMembers.length} onNew={can("manage_channels") ? () => setNewOpen(true) : undefined} />
        </div>
      ) : (
        <EmptyState icon={Hash} title={t("tm.chat.empty.title")} description={t("tm.chat.empty.body")} />
      )}

      {newVisible && (
        <NewChannelDialog
          ctx={ctx}
          onClose={() => {
            setNewOpen(false);
            if (params.get("new") === "1") clearRequest();
          }}
          onCreated={(name) => {
            setNewOpen(false);
            load();
            router.replace(teamLink(team.id, "chat", { channel: name }));
          }}
        />
      )}
      {settingsTarget && (
        <ChannelSettingsDialog
          ctx={ctx}
          channel={settingsTarget}
          onClose={() => {
            setSettingsFor(null);
            if (params.get("settings") === "1") clearRequest();
          }}
          onChanged={() => {
            setSettingsFor(null);
            if (params.get("settings") === "1") clearRequest();
            load();
          }}
        />
      )}
    </section>
  );
}

function ChannelView({
  channel,
  channels,
  members,
  onSelect,
  onlineCount,
  onNew,
}: {
  channel: TeamChannel;
  channels: TeamChannel[];
  members: ChannelMember[];
  onSelect: (channel: TeamChannel) => void;
  onlineCount: number;
  onNew?: () => void;
}) {
  const { t } = useTranslation();
  const controls = useRef<EmbeddedChatControls>(null);
  const faces = members.slice(0, 4);
  const more = Math.max(0, channel.memberCount - faces.length);
  const iconButton = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] border border-border-soft bg-surface md:h-[calc(100dvh-20rem)] md:min-h-[32rem]" data-testid="team-channel-view" data-channel-id={channel.id}>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border-soft px-5">
        <div className="min-w-0 flex-1 leading-tight">
          <h3 className="flex items-center gap-1.5 truncate font-display text-h3 font-bold text-text">
            {channel.mode === "private" && <Lock size={16} className="shrink-0 text-warning" aria-hidden />}
            <span className="truncate"># {channel.name}</span>
          </h3>
          <p className="truncate text-caption text-text-muted">
            {channel.description || t(channel.mode === "private" ? "tm.chat.modePrivate" : channel.mode === "project" ? "tp.chat.modeProject" : channel.mode === "space" ? "tm.chat.modeSpace" : "tm.chat.modeOpen")}
            <span className="lg:hidden">
              {" · "}
              {t("tm.chat.memberCount", { count: channel.memberCount })}
              {onlineCount > 0 && ` · ${t("tm.chat.onlineCount", { count: onlineCount })}`}
            </span>
          </p>
        </div>
        {faces.length > 0 && (
          <div className="hidden items-center lg:flex" data-channel-faces>
            {faces.map((m) => (
              <span key={m.userId} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0">
                <PresenceAvatar userId={m.userId} src={m.avatarUrl} alt={m.displayName || m.username} size={28} />
              </span>
            ))}
            {more > 0 && <span className="ml-2 text-caption text-text-muted">+{more}</span>}
          </div>
        )}
        <button
          type="button"
          onClick={() => controls.current?.openSearch()}
          aria-label={t("chat.search.open")}
          title={t("chat.search.open")}
          data-chat-search-toggle
          className={cn(iconButton, "bg-surface-soft text-text-secondary hover:text-text lg:w-44 lg:justify-start lg:gap-2 lg:px-3.5 lg:whitespace-nowrap")}
        >
          <Search size={16} aria-hidden />
          <span className="hidden text-small lg:inline">{t("tm.chat.searchHint")}</span>
        </button>
        <button type="button" onClick={() => controls.current?.openChannelInfo()} aria-label={`${t("tm.info.channelInfo")}: #${channel.name}`} title={t("tm.info.channelInfo")} data-channel-info-open className={cn(iconButton, "bg-primary-soft text-primary hover:bg-border-soft")}>
          <Info size={18} aria-hidden />
        </button>
      </header>
      <ScrollRow className="shrink-0 gap-2 border-b border-border-soft px-4 py-2 max-md:hidden lg:hidden" data-testid="team-channel-chips">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            aria-current={c.id === channel.id ? "true" : undefined}
            data-channel-chip={c.name}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-small font-semibold",
              c.id === channel.id ? "bg-primary-soft text-primary" : "bg-surface-soft text-text-secondary",
            )}
          >
            {c.mode === "private" ? <Lock size={13} aria-hidden /> : <Hash size={13} aria-hidden />}
            {c.name}
            {c.unreadCount > 0 && !c.muted && c.id !== channel.id && <span className="rounded-full bg-secondary px-1.5 text-caption font-bold text-white">{formatUnread(c.unreadCount)}</span>}
          </button>
        ))}
        {onNew && (
          <button type="button" onClick={onNew} aria-label={t("tm.chat.newChannel")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary hover:text-text">
            <Plus size={15} aria-hidden />
          </button>
        )}
      </ScrollRow>
      {/* Mesajlar'daki GERÇEK sohbet ekranı (tepki, yanıt, sabitleme, fotoğraf, GIF, yıldız, düzenleme, "yazıyor…"): aynı konuşma, iki giriş. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <LocalConversationView
          key={channel.id}
          dock={{
            conversationId: channel.id,
            embedded: true,
            controlRef: controls,
            onBack: noop,
            onExpand: noop,
            onMinimize: noop,
            onOpenConversation: (conversationId) => {
              const next = channels.find((c) => c.id === conversationId);
              if (next) onSelect(next);
            },
          }}
        />
      </div>
    </div>
  );
}

const noop = () => undefined;

type ChannelMode = "open" | "private" | "space";

function NewChannelDialog({ ctx, onClose, onCreated }: { ctx: TeamCtx; onClose: () => void; onCreated: (name: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<ChannelMode>("open");
  const [space, setSpace] = useState("");
  const [spaces, setSpaces] = useState<TeamSpaceRow[]>([]);
  const [posting, setPosting] = useState<"members" | "admins">("members");
  const [notify, setNotify] = useState<"all" | "mentions" | "none">("mentions");
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listTeamSpaces(ctx.team.id, 0).then((page) => setSpaces(page.items.filter((s) => !s.isLibrary)), () => undefined);
  }, [ctx.team.id]);

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!slug) {
      setError(t("tm.error.channel_invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTeamChannel(ctx.team.id, { name: slug, description: description.trim(), mode, space: mode === "space" ? space || null : null, posting, notify, entries: mode === "private" ? entries : [] });
      onCreated(slug);
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tm.chat.newChannel")}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={(event) => void submit(event)}
      formTestId="team-new-channel-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !slug || (mode === "space" && !space)}>
            {t("tm.chat.createChannel")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="channel-name" className={fieldLabelClassName}>
            {t("tm.chat.channelName")}
          </label>
          <input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={fieldInputClassName} autoComplete="off" placeholder="tasarim" />
          {slug && <p className="mt-1 text-caption text-text-muted">#{slug}</p>}
        </div>
        <div>
          <label htmlFor="channel-desc" className={fieldLabelClassName}>
            {t("tm.chat.channelDescription")}
          </label>
          <input id="channel-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className={fieldInputClassName} />
        </div>
        <div>
          <span className={fieldLabelClassName}>{t("tm.chat.whoJoins")}</span>
          <PillChoice<ChannelMode>
            ariaLabel={t("tm.chat.whoJoins")}
            value={mode}
            onChange={setMode}
            options={[
              { key: "open", label: t("tm.chat.mode.open"), hint: t("tm.chat.mode.openHint") },
              { key: "private", label: t("tm.chat.mode.private"), hint: t("tm.chat.mode.privateHint") },
            ]}
          />
          <p className="mt-1.5 text-caption text-text-muted">{t(`tm.chat.mode.${mode}Hint` as "tm.chat.mode.openHint")}</p>
        </div>
        {mode === "space" && (
          <select value={space} onChange={(e) => setSpace(e.target.value)} aria-label={t("tm.chat.pickSpace")} className={fieldInputClassName}>
            <option value="">{t("tm.chat.pickSpace")}</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
        {mode === "private" && <AccessEditor teamId={ctx.team.id} entries={entries} onChange={setEntries} levels={false} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={fieldLabelClassName}>{t("tm.chat.posting")}</span>
            <PillChoice<"members" | "admins"> ariaLabel={t("tm.chat.posting")} value={posting} onChange={setPosting} options={[{ key: "members", label: t("tm.chat.posting.members") }, { key: "admins", label: t("tm.chat.posting.admins") }]} />
          </div>
          <div>
            <span className={fieldLabelClassName}>{t("tm.chat.notify")}</span>
            <PillChoice<"all" | "mentions" | "none"> ariaLabel={t("tm.chat.notify")} value={notify} onChange={setNotify} options={[{ key: "all", label: t("tm.chat.notify.all") }, { key: "mentions", label: t("tm.chat.notify.mentions") }, { key: "none", label: t("tm.chat.notify.none") }]} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}

function ChannelSettingsDialog({ ctx, channel, onClose, onChanged }: { ctx: TeamCtx; channel: TeamChannel; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState(channel.description ?? "");
  const [posting, setPosting] = useState(channel.postingPolicy);
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loaded, setLoaded] = useState(channel.mode !== "private");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (channel.mode !== "private") return;
    void fetchChannelAccess(channel.id).then(
      (access) => {
        setEntries(access.entries);
        setLoaded(true);
      },
      (e: TeamActionError) => setError(e.message),
    );
  }, [channel.id, channel.mode]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateTeamChannel(channel.id, { description: description.trim(), posting_policy: posting });
      if (channel.mode === "private") await setChannelAccess(channel.id, entries);
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return (
    <>
      <SpaceDialog
        title={t("tm.chat.settingsTitle", { name: channel.name })}
        onClose={onClose}
        busy={busy}
        wide
        onSubmit={(event) => void save(event)}
        formTestId="team-channel-settings"
        footer={
          <>
            {!channel.isDefault && (
              <>
                <Button type="button" variant="ghost" onClick={() => void run(() => archiveTeamChannel(channel.id, true))} disabled={busy}>
                  {t("tm.chat.archive")}
                </Button>
                <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  {t("common.delete")}
                </Button>
              </>
            )}
            <Button type="submit" disabled={busy || !loaded}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="channel-set-desc" className={fieldLabelClassName}>
              {t("tm.chat.channelDescription")}
            </label>
            <input id="channel-set-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className={fieldInputClassName} />
          </div>
          <div>
            <span className={fieldLabelClassName}>{t("tm.chat.posting")}</span>
            <PillChoice<"members" | "admins"> ariaLabel={t("tm.chat.posting")} value={posting} onChange={setPosting} options={[{ key: "members", label: t("tm.chat.posting.members") }, { key: "admins", label: t("tm.chat.posting.admins") }]} />
          </div>
          {channel.mode === "private" && loaded && (
            <div>
              <span className={fieldLabelClassName}>{t("tm.chat.channelMembers")}</span>
              <AccessEditor teamId={ctx.team.id} entries={entries} onChange={setEntries} levels={false} />
            </div>
          )}
          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>
      </SpaceDialog>
      {confirmDelete && (
        <ConfirmDialog
          id="team-channel-delete"
          title={t("tm.chat.deleteTitle", { name: channel.name })}
          body={t("tm.chat.deleteBody")}
          confirmLabel={t("common.delete")}
          danger
          busy={busy}
          error={error}
          overLayers
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void run(() => deleteTeamChannel(channel.id))}
        />
      )}
    </>
  );
}
