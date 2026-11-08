"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Hash } from "@/components/icons/hash";
import { Lock } from "@/components/icons/lock";
import { Plus } from "@/components/icons/plus";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { LocalConversationView } from "@/features/messages/local-conversation-view";
import { PresenceAvatar } from "@/features/presence/presence-ui";
import { useOnlineIds } from "@/features/presence/use-presence";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  archiveTeamChannel,
  createTeamChannel,
  deleteTeamChannel,
  fetchChannelAccess,
  listChannelMembers,
  listTeamChannels,
  listTeamSpaces,
  setChannelAccess,
  setChannelNotify,
  updateTeamChannel,
  type AccessEntry,
  type ChannelMember,
  type TeamActionError,
  type TeamChannel,
  type TeamSpaceRow,
} from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { cn } from "@/lib/utils";
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
  const select = (channel: TeamChannel) => router.replace(teamLink(team.id, "chat", { channel: channel.name }));

  if (failed) return <EmptyState icon={Hash} title={t("tm.chat.failed")} action={{ label: t("common.retry"), onClick: load }} />;
  if (!channels) return <p className="py-10 text-center text-small text-text-muted">{t("common.loading")}</p>;

  return (
    <section className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]" data-testid="team-chat">
      <aside className={cn("space-y-3", wanted && "max-md:hidden")} data-testid="team-channel-aside">
        <div className="flex items-center justify-between">
          <h2 className="text-label font-semibold uppercase tracking-wide text-text-muted">{t("tm.chat.channels")}</h2>
          {can("manage_channels") && (
            <button type="button" onClick={() => setNewOpen(true)} aria-label={t("tm.chat.newChannel")} className="grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-surface-soft" data-channel-new>
              <Plus size={16} aria-hidden />
            </button>
          )}
        </div>
        <ul className="space-y-0.5" data-testid="team-channel-list">
          {visible.map((channel) => (
            <li key={channel.id}>
              <button
                type="button"
                onClick={() => select(channel)}
                data-channel={channel.name}
                aria-current={active?.id === channel.id ? "true" : undefined}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-small transition-colors",
                  active?.id === channel.id ? "bg-primary-soft font-medium text-primary" : "text-text-secondary hover:bg-surface-soft",
                )}
              >
                {channel.mode === "private" ? <Lock size={14} aria-hidden /> : <Hash size={14} aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                {channel.unreadCount > 0 && !channel.muted && <span className="rounded-full bg-primary px-1.5 text-caption text-primary-foreground">{channel.unreadCount}</span>}
              </button>
            </li>
          ))}
        </ul>
        {archived.length > 0 && can("manage_channels") && (
          <details className="text-caption text-text-muted">
            <summary className="cursor-pointer">{t("tm.chat.archived", { count: archived.length })}</summary>
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
        {onlineMembers.length > 0 && (
          <div data-testid="team-online">
            <h2 className="mb-1 mt-3 text-label font-semibold uppercase tracking-wide text-text-muted">{t("tm.chat.online", { count: onlineMembers.length })}</h2>
            <ul className="space-y-1">
              {onlineMembers.slice(0, 8).map((m) => (
                <li key={m.userId} className="flex items-center gap-2 text-small text-text-secondary">
                  <PresenceAvatar userId={m.userId} src={m.avatarUrl} alt={m.displayName || m.username} size={24} />
                  <span className="truncate">{m.displayName || m.username}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {active ? (
        // Telefonda tek bölme: kanal seçilene kadar yalnız liste, seçilince yalnız sohbet (+ geri). Masaüstünde ikisi yan yana.
        <div className={cn("min-w-0", !wanted && "max-md:hidden")}>
          <button type="button" onClick={() => router.replace(teamLink(team.id, "chat"))} className="mb-2 inline-flex items-center gap-1 text-small text-primary md:hidden" data-channel-back>
            ‹ {t("tm.chat.channels")}
          </button>
          <ChannelView key={active.id} ctx={ctx} channel={active} onlineCount={onlineMembers.length} onSettings={() => setSettingsFor(active)} onChanged={load} />
        </div>
      ) : (
        <EmptyState icon={Hash} title={t("tm.chat.empty.title")} description={t("tm.chat.empty.body")} />
      )}

      {newOpen && (
        <NewChannelDialog
          ctx={ctx}
          onClose={() => setNewOpen(false)}
          onCreated={(name) => {
            setNewOpen(false);
            load();
            router.replace(teamLink(team.id, "chat", { channel: name }));
          }}
        />
      )}
      {settingsFor && (
        <ChannelSettingsDialog
          ctx={ctx}
          channel={settingsFor}
          onClose={() => setSettingsFor(null)}
          onChanged={() => {
            setSettingsFor(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function ChannelView({ ctx, channel, onlineCount, onSettings, onChanged }: { ctx: TeamCtx; channel: TeamChannel; onlineCount: number; onSettings: () => void; onChanged: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-lg border border-border-soft bg-surface md:h-[calc(100dvh-20rem)] md:min-h-[32rem]" data-testid="team-channel-view" data-channel-id={channel.id}>
      <header className="flex shrink-0 items-center gap-2 border-b border-border-soft px-4 py-3">
        {channel.mode === "private" ? <Lock size={16} aria-hidden /> : <Hash size={16} aria-hidden />}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-body font-semibold"># {channel.name}</h3>
          <p className="truncate text-caption text-text-muted">
            {channel.description || t(channel.mode === "private" ? "tm.chat.modePrivate" : channel.mode === "space" ? "tm.chat.modeSpace" : "tm.chat.modeOpen")}
            {" · "}
            {t("tm.chat.memberCount", { count: channel.memberCount })}
            {onlineCount > 0 && ` · ${t("tm.chat.onlineCount", { count: onlineCount })}`}
          </p>
        </div>
        <select
          aria-label={t("tm.chat.notify")}
          value={channel.notifyLevel}
          onChange={(event) => void setChannelNotify(channel.id, event.target.value as "all" | "mentions" | "none").then(onChanged)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-caption"
        >
          <option value="all">{t("tm.chat.notify.all")}</option>
          <option value="mentions">{t("tm.chat.notify.mentions")}</option>
          <option value="none">{t("tm.chat.notify.none")}</option>
        </select>
        {ctx.can("manage_channels") && (
          <Button type="button" size="sm" variant="outline" onClick={onSettings} data-channel-settings>
            {t("tm.chat.settings")}
          </Button>
        )}
      </header>
      {/* Mesajlar'daki GERÇEK sohbet ekranı (tepki, yanıt, sabitleme, fotoğraf, GIF, yıldız, düzenleme, "yazıyor…"): aynı konuşma, iki giriş. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <LocalConversationView key={channel.id} dock={{ conversationId: channel.id, embedded: true, onBack: noop, onExpand: noop, onMinimize: noop }} />
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
              { key: "space", label: t("tm.chat.mode.space"), hint: t("tm.chat.mode.spaceHint") },
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
