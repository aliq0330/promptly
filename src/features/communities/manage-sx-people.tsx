"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { useAuth } from "@/features/auth/auth-provider";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { useChatMute } from "@/features/groups/personal-prefs";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { useReport } from "@/features/moderation/report-provider";
import { useRoomsCount } from "./manage-sx-helpers";
import { SxAvatar, SxBtn, SxCard, SxConfirmPage, SxGap, SxHash, SxLabel, SxNote, SxPage, SxPicker, SxRow, SxRowCol, SxSep, SxSub, SxTag } from "@/features/settings/sx";
import { patchCachedRoom, useCommunityRooms } from "@/features/messages/rooms/use-community-rooms";
import { setRoomMuted } from "@/lib/supabase/community-rooms";
import { roomPick } from "@/lib/notify-standard";
import { buildGroupJoinUrl, can, leaveOutcome } from "@/lib/chat-groups";
import { communityHref, isTemporarilyMuted, MUTE_DURATIONS_HOURS, muteUntilIso, NOTIFY_LEVELS } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchProfileByUsername } from "@/lib/supabase/profiles";
import { SHARE_BASE_PATH } from "@/lib/share-link";
import { cancelInvitation, createChatGroupLink, deleteChatGroup, fetchGroupBans, fetchGroupInvitations, fetchGroupLinkList, inviteToChatGroup, leaveChatGroup, revokeChatGroupLink, unbanChatGroupMember, type GroupBan, type GroupInvitation, type GroupLinkRow } from "@/lib/supabase/chat-groups";
import { closeCommunity, reopenCommunity, setCommunityNotifyPrefs, type MyCommunityMembership } from "@/lib/supabase/communities";
import { formatRelativeTime } from "@/lib/utils";
import type { ChatGroup, CommunityNotifyLevel, CommunityRoom } from "@/types";

/** B3 · Davetler ve bağlantılar · B4 · Senin tercihlerin · B5 · Kapat veya sil · B6 · Silme onayı. */

export function InvitesPage({ root, group, onChanged, onToast, sub, setSub }: { root?: boolean; group: ChatGroup; onChanged: () => void | Promise<void>; onToast: (message: string) => void; sub: string | null; setSub: (sub: string | null) => void }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [links, setLinks] = useState<GroupLinkRow[]>([]);
  const [bans, setBans] = useState<GroupBan[]>([]);
  const [reload, setReload] = useState(0);
  const [username, setUsername] = useState("@");
  // Yasaklılar yalnız yasak/çıkarma yetkisi olana okunur (RLS); kaldırma yalnız `ban_members`.
  const canSeeBans = can(group.myRole, "ban_members", group.rolePermissions) || can(group.myRole, "remove_members", group.rolePermissions);
  const canUnban = can(group.myRole, "ban_members", group.rolePermissions);
  const invite = useAsyncAction();
  const row = useAsyncAction();
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchGroupInvitations(group.id), fetchGroupLinkList(group.id), canSeeBans ? fetchGroupBans(group.id) : Promise.resolve([] as GroupBan[])]).then(
      ([i, l, b]) => {
        if (!alive) return;
        setInvitations(i);
        setLinks(l);
        setBans(b);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [group.id, reload, canSeeBans]);

  async function send() {
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    const done = await invite.run(async () => {
      const profile = await fetchProfileByUsername(name);
      if (!profile) throw new Error(t("ay.invites.notFound"));
      const result = await inviteToChatGroup(group.id, [profile.id]);
      return result;
    });
    if (!done) return;
    onToast(t("ay.invites.sent", { name }));
    setUsername("@");
    setReload((n) => n + 1);
    await onChanged();
  }
  async function act(task: () => Promise<void>, toast: string) {
    const ok = await row.run(async () => {
      await task();
      return true;
    });
    if (!ok) return;
    onToast(toast);
    setReload((n) => n + 1);
    await onChanged();
  }

  return (
    <>
      <SxPage root={root} parent={t("ay.manage.title")} title={t("ay.manage.invites")} backHref={communityHref(group.id, "manage")} testId="community-invites-page">
        <SxLabel>{t("ay.invites.byUsername")}</SxLabel>
        <SxCard style={{ paddingTop: 14, paddingBottom: 16 }}>
          <label className="fl" htmlFor="dv-ad">{t("ay.invites.username")}</label>
          <input id="dv-ad" className="inp" value={username} placeholder="@kullanıcı" onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          <p className={invite.error ? "hint err" : "hint"}>{invite.error ?? t("ay.invites.hint")}</p>
          <SxBtn tone="pri" full style={{ marginTop: 12, height: 46 }} disabled={invite.busy} onClick={() => void send()}>
            {t("ay.invites.send")}
          </SxBtn>
        </SxCard>

        <SxLabel>{t("ay.invites.pending", { count: invitations.length })}</SxLabel>
        <SxCard>
          {invitations.length === 0 && <SxRow title={t("ay.invites.none")} />}
          {invitations.map((inv) => (
            <SxRow
              key={inv.id}
              lead={<SxAvatar name={inv.user?.displayName ?? inv.user?.username ?? "?"} src={inv.user?.avatarUrl} />}
              title={`@${inv.user?.username ?? ""}`}
              desc={t("ay.invites.when", { when: formatRelativeTime(inv.createdAt, language) })}
              trailing={<SxBtn disabled={row.busy} onClick={() => void act(() => cancelInvitation(inv.id), t("ay.invites.canceled"))}>{t("ay.invites.undo")}</SxBtn>}
            />
          ))}
        </SxCard>

        <SxLabel>{t("ay.invites.links")}</SxLabel>
        <SxCard>
          {links.length === 0 && <SxRow title={t("ay.invites.noLinks")} />}
          {links.map((link, index) => (
            <div key={link.id}>
              {index > 0 && <SxSep />}
              <SxRowCol title={`…/join#${link.id.slice(0, 6)}`}>
                <div className="s">
                  {link.expired ? <><SxTag>{t("ay.invites.expired")}</SxTag> </> : null}
                  {link.maxUses ? t("ay.invites.usesOf", { used: link.useCount, max: link.maxUses }) : t("ay.invites.uses", { used: link.useCount })}
                  {!link.expired && ` · ${t("ay.invites.until", { date: new Date(link.expiresAt).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "short" }) })}`}
                </div>
                {!link.expired && <div className="s">{t("ay.invites.by", { name: link.createdBy === user?.id ? t("ay.invites.you") : "—" })}</div>}
                {!link.expired && <SxBtn tone="dng" disabled={row.busy} onClick={() => void act(() => revokeChatGroupLink(link.id), t("ay.invites.revoked"))}>{t("ay.invites.revoke")}</SxBtn>}
              </SxRowCol>
            </div>
          ))}
        </SxCard>
        <SxGap h={14} />
        <div style={{ padding: "0 16px" }}>
          <SxBtn tone="out" full style={{ height: 46 }} onClick={() => setSub("newlink")}>
            {t("ay.invites.newLink")}
          </SxBtn>
        </div>
        {bans.length > 0 && (
          <>
            <SxLabel>{t("ay.invites.bans", { count: bans.length })}</SxLabel>
            <SxCard>
              {bans.map((ban) => (
                <SxRow
                  key={ban.userId}
                  lead={<SxAvatar name={ban.user?.displayName ?? "?"} src={ban.user?.avatarUrl} />}
                  title={ban.user?.displayName ?? t("common.genericUser")}
                  desc={ban.reason ?? undefined}
                  trailing={canUnban ? <SxBtn disabled={row.busy} onClick={() => void act(() => unbanChatGroupMember(group.id, ban.userId), t("groups.bans.unbannedToast"))}>{t("groups.bans.unban")}</SxBtn> : undefined}
                />
              ))}
            </SxCard>
          </>
        )}
        <SxGap h={16} />
        <SxNote>{t("ay.invites.note")}</SxNote>
      </SxPage>
      {sub === "newlink" && <NewLinkPage group={group} onClose={() => setSub(null)} onCreated={() => setReload((n) => n + 1)} onToast={onToast} />}
    </>
  );
}

function NewLinkPage({ group, onClose, onCreated, onToast }: { group: ChatGroup; onClose: () => void; onCreated: () => void; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const [expiry, setExpiry] = useState(168);
  const [uses, setUses] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  async function create() {
    const created = await action.run(() => createChatGroupLink(group.id, expiry, uses ? Number(uses) : null));
    if (!created) return;
    setFresh(buildGroupJoinUrl(window.location.origin, SHARE_BASE_PATH, created.token));
    onCreated();
  }
  return (
    <SxSub
      open
      onClose={onClose}
      parent={t("ay.manage.invites")}
      title={t("ay.invites.newLink")}
      testId="community-new-link"
      footer={
        fresh ? (
          <SxBtn
            tone="pri"
            full
            onClick={() => {
              void navigator.clipboard?.writeText(fresh).then(() => onToast(t("common.linkCopied")), () => onToast(t("groups.link.copyFailed")));
            }}
          >
            {t("ay.invites.copy")}
          </SxBtn>
        ) : (
          <SxBtn tone="pri" full disabled={action.busy} onClick={() => void create()}>
            {action.busy ? t("common.loading") : t("ay.invites.create")}
          </SxBtn>
        )
      }
    >
      <SxLabel>{t("groups.link.expiry")}</SxLabel>
      <ChoiceGroup<string> variant="sx-chips" ariaLabel={t("groups.link.expiry")} value={String(expiry)} onChange={(k) => setExpiry(Number(k))} options={[{ key: "1", label: t("groups.link.expiry1h") }, { key: "24", label: t("groups.link.expiry1d") }, { key: "168", label: t("groups.link.expiry7d") }, { key: "720", label: t("groups.link.expiry30d") }]} />
      <SxLabel>{t("ay.invites.maxUses")}</SxLabel>
      <ChoiceGroup<string> variant="sx-chips" ariaLabel={t("ay.invites.maxUses")} value={uses} onChange={setUses} options={[{ key: "", label: t("groups.link.usesUnlimited") }, { key: "1", label: t("groups.link.uses1") }, { key: "10", label: t("groups.link.uses10") }, { key: "100", label: t("groups.link.uses100") }]} />
      {fresh && (
        <>
          <SxLabel>{t("ay.invites.fresh")}</SxLabel>
          <SxCard style={{ paddingTop: 14, paddingBottom: 14 }}>
            <input className="inp" readOnly value={fresh} aria-label={t("ay.invites.fresh")} onFocus={(e) => e.currentTarget.select()} />
            <p className="hint">{t("ay.invites.freshHint")}</p>
          </SxCard>
        </>
      )}
      {action.error && (
        <>
          <SxGap h={12} />
          <SxNote><span className="dgt">{action.error}</span></SxNote>
        </>
      )}
    </SxSub>
  );
}

// ---------------------------------------------------------------------------------------------
// B4 · Senin tercihlerin (Hakkında sekmesindeki kişisel ayarlar)
// ---------------------------------------------------------------------------------------------

export function PrefsPage({ group, membership, viewerId, reload, onToast, sub, setSub }: { group: ChatGroup; membership: MyCommunityMembership | null; viewerId: string | null; reload: () => Promise<void>; onToast: (message: string) => void; sub: string | null; setSub: (sub: string | null) => void }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { refresh, patchConversation } = useRealMessages();
  const { openReport } = useReport();
  const prefs = useAsyncAction();
  const [pendingLevel, setPendingLevel] = useState<CommunityNotifyLevel | null>(null);
  const [hours, setHours] = useState<number | null>(null);
  const [roomSheet, setRoomSheet] = useState<CommunityRoom | null>(null);
  const { rooms } = useCommunityRooms(group.id);
  const level = pendingLevel ?? membership?.notifyLevel ?? "all";
  const mutedUntil = membership?.notifyMutedUntil ?? null;
  const tempMuted = isTemporarilyMuted(mutedUntil);
  const chatMute = useChatMute({
    groupId: group.id,
    mutedAt: membership?.mutedAt ?? null,
    onMutedChange: (mutedAt) => {
      patchConversation(group.id, { mutedAt });
      void reload();
    },
    onToast,
  });
  const accepted = (membership?.acceptedRulesVersion ?? 0) >= group.rulesVersion;
  const outcome = leaveOutcome(group.myRole, group.memberCount);

  async function savePrefs(nextLevel: CommunityNotifyLevel, until: string | null) {
    if (!viewerId) return;
    setPendingLevel(nextLevel);
    const ok = await prefs.run(async () => {
      await setCommunityNotifyPrefs(group.id, viewerId, nextLevel, until);
      return true;
    });
    if (!ok) {
      setPendingLevel(null);
      return;
    }
    onToast(t("communities.notify.savedToast"));
    await reload();
    setPendingLevel(null);
  }

  return (
    <>
      <SxPage parent={group.name} title={t("ay.prefs.title")} backHref={communityHref(group.id, "about")} testId="community-prefs-page">
        <SxLabel>{t("notify.section.community")}</SxLabel>
        <SxCard style={{ padding: 12 }}>
          <ChoiceGroup<CommunityNotifyLevel>
            variant="sx-seg"
            ariaLabel={t("notify.section.community")}
            value={level}
            disabled={prefs.busy}
            onChange={(value) => void savePrefs(value, null)}
            options={NOTIFY_LEVELS.map((value) => ({ key: value, label: t(`communities.notify.level.${value}`) }))}
          />
          <p className="hint" style={{ padding: "8px 4px 4px" }}>{t(`ay.prefs.level.${level}Help` as const)}</p>
        </SxCard>

        <SxLabel>{t("ay.prefs.muteFor")}</SxLabel>
        <ChoiceGroup<string>
          variant="sx-chips"
          ariaLabel={t("ay.prefs.muteFor")}
          value={hours === null ? null : String(hours)}
          disabled={prefs.busy}
          onChange={(key) => {
            setHours(Number(key));
            void savePrefs(level, muteUntilIso(Number(key)));
          }}
          options={MUTE_DURATIONS_HOURS.map((h) => ({ key: String(h), label: t(`communities.notify.hours.${h}` as "communities.notify.hours.1") }))}
        />
        {tempMuted && mutedUntil && (
          <p className="hint" style={{ margin: "8px 20px 0" }}>
            {t("ay.prefs.mutedUntil", { until: new Date(mutedUntil).toLocaleString(language === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}{" "}
            <button type="button" disabled={prefs.busy} onClick={() => void savePrefs(level, null)} style={{ color: "var(--ot)", fontWeight: 600 }}>
              {t("communities.notify.unmute")}
            </button>
          </p>
        )}

        <SxLabel>{t("notify.section.chats")}</SxLabel>
        <SxCard style={{ padding: 12 }}>
          <div className="t" style={{ padding: "2px 4px 10px" }}>{t("notify.chats.community")}</div>
          <ChoiceGroup<"all" | "none">
            variant="sx-seg"
            ariaLabel={t("notify.chats.community")}
            value={roomPick(chatMute.muted)}
            disabled={chatMute.busy}
            onChange={(next) => { if ((next === "none") !== chatMute.muted) void chatMute.toggle(); }}
            options={[{ key: "all", label: t("notify.level.all") }, { key: "none", label: t("notify.level.none") }]}
          />
          <p className="hint" style={{ padding: "8px 4px 4px" }}>{t("notify.chats.communityHint")}</p>
        </SxCard>

        {rooms.length > 1 && (
          <>
            <SxLabel>{t("notify.section.rooms")}</SxLabel>
            <SxCard>
              {rooms.map((room) => (
                <SxRow
                  key={room.id}
                  lead={<SxHash />}
                  title={room.name}
                  trailing={<SxBtn tone="sel" onClick={() => setRoomSheet(room)}>{t(room.muted ? "notify.level.none" : "notify.level.all")}</SxBtn>}
                />
              ))}
            </SxCard>
          </>
        )}

        <SxGap h={16} />
        <SxNote><b>{t("notify.always.label")}</b> {t("notify.always.community")}</SxNote>

        <SxLabel>{t("ay.rules.section")}</SxLabel>
        <SxCard>
          <SxRow href={communityHref(group.id, "about")} title={t("ay.rules.title")} desc={t("ay.prefs.rulesVersion", { version: group.rulesVersion })} trailing={group.rules ? <SxTag tone={accepted ? "ok" : "or"}>{accepted ? t("ay.prefs.rulesAccepted") : t("ay.prefs.rulesPending")}</SxTag> : undefined} />
        </SxCard>

        <SxLabel>{t("ay.prefs.other")}</SxLabel>
        <SxCard>
          {group.myRole !== "owner" && (
            <>
              <SxRow nav title={t("communities.about.reportCommunity")} desc={t("ay.prefs.reportDesc")} onClick={() => openReport({ type: "community", id: group.id, title: group.name })} />
              <SxSep />
            </>
          )}
          {outcome === "must_transfer" ? (
            <SxRow title={t("groups.about.leave")} titleClass="dgt" desc={t("groups.about.ownerMustTransfer")} href={communityHref(group.id, "members")} />
          ) : (
            <SxRow nav title={t("groups.about.leave")} titleClass="dgt" desc={t("ay.prefs.leaveDesc")} onClick={() => setSub("leave")} />
          )}
        </SxCard>
        {prefs.error && (
          <>
            <SxGap h={12} />
            <SxNote><span className="dgt">{prefs.error}</span></SxNote>
          </>
        )}
      </SxPage>
      {roomSheet && (
        <SxPicker<"all" | "none">
          open
          onClose={() => setRoomSheet(null)}
          parent={t("ay.prefs.title")}
          title={roomSheet.name}
          label={t("notify.picker.room")}
          options={[
            { key: "all", label: t("notify.level.all"), desc: t("notify.room.all") },
            { key: "none", label: t("notify.level.none"), desc: t("notify.room.none") },
          ]}
          value={roomSheet.muted ? "none" : "all"}
          onPick={(next) => void prefs.run(async () => {
            const muted = next === "none";
            patchCachedRoom(group.id, roomSheet.id, { muted });
            try {
              await setRoomMuted(roomSheet.id, muted);
            } catch (err) {
              patchCachedRoom(group.id, roomSheet.id, { muted: !muted });
              throw err;
            }
            return true;
          })}
          pickLabel={t("ay.pick")}
          testId="community-room-notify-picker"
        />
      )}
      {sub === "leave" && <LeavePage group={group} onClose={() => setSub(null)} onLeft={() => { void refresh(); onToast(t("communities.about.leftToast")); router.push("/communities"); }} />}
    </>
  );
}

function LeavePage({ group, onClose, onLeft }: { group: ChatGroup; onClose: () => void; onLeft: () => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const outcome = leaveOutcome(group.myRole, group.memberCount);
  return (
    <SxConfirmPage
      parent={t("ay.prefs.title")}
      title={outcome === "closes_group" ? t("groups.about.leaveClosesTitle") : t("groups.about.leaveConfirmTitle", { name: group.name })}
      lead={outcome === "closes_group" ? t("groups.about.leaveClosesGroup") : t("groups.about.leaveConfirmBody")}
      note={t("groups.about.leaveAlsoChat")}
      cancelLabel={t("common.cancel")}
      confirmLabel={t("groups.about.leave")}
      busy={action.busy}
      error={action.error}
      onClose={onClose}
      onConfirm={() => void action.run(async () => { await leaveChatGroup(group.id); return true; }).then((done) => done && onLeft())}
      testId="community-leave-page"
    />
  );
}

// ---------------------------------------------------------------------------------------------
// B5 · Kapat veya sil · B6 · Silme onayı
// ---------------------------------------------------------------------------------------------

export function DangerPage({ group, onChanged, onToast, sub, setSub }: { group: ChatGroup; onChanged: () => void | Promise<void>; onToast: (message: string) => void; sub: string | null; setSub: (sub: string | null) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh } = useRealMessages();
  const closed = Boolean(group.closedAt);
  const roomsCount = useRoomsCount(group.id);
  const close = useAsyncAction();
  const del = useAsyncAction();
  const [typed, setTyped] = useState("");
  return (
    <>
      <SxPage parent={t("ay.manage.title")} title={t("ay.manage.dangerRow")} backHref={communityHref(group.id, "manage")} testId="community-danger-page">
        <p className="s" style={{ margin: "8px 20px 0" }}>{t("ay.danger.intro")}</p>
        <SxLabel>{t("ay.danger.temporary")}</SxLabel>
        <SxCard>
          <SxRowCol title={closed ? t("communities.settings.reopenTitle") : t("ay.danger.closeTitle")} desc={closed ? t("communities.settings.reopenHelp") : t("ay.danger.closeHelp")}>
            <SxBtn tone="out" onClick={() => setSub("close")}>{closed ? t("communities.settings.reopen") : t("ay.danger.closeTitle")}</SxBtn>
          </SxRowCol>
        </SxCard>
        <SxLabel>{t("ay.danger.label")}</SxLabel>
        <SxCard>
          <SxRowCol title={t("ay.danger.deleteTitle")} desc={t("ay.danger.deleteHelp")}>
            <SxBtn tone="dng" onClick={() => setSub("delete")}>{t("ay.danger.deleteTitle")}</SxBtn>
          </SxRowCol>
        </SxCard>
        <SxGap h={16} />
        <SxNote><b>{t("ay.danger.noteTitle")}</b> {t("ay.danger.note")}</SxNote>
      </SxPage>

      {sub === "close" && (
        <SxConfirmPage
          parent={t("ay.manage.dangerRow")}
          title={closed ? t("communities.settings.reopenConfirmTitle") : t("communities.settings.closeConfirmTitle")}
          lead={closed ? t("communities.settings.reopenConfirmBody") : t("communities.settings.closeConfirmBody")}
          cancelLabel={t("common.cancel")}
          confirmLabel={closed ? t("communities.settings.reopen") : t("ay.danger.closeTitle")}
          confirmTone={closed ? "pri" : "dng"}
          busy={close.busy}
          error={close.error}
          onClose={() => setSub(null)}
          onConfirm={() =>
            void close
              .run(async () => {
                if (closed) await reopenCommunity(group.id);
                else await closeCommunity(group.id);
                return true;
              })
              .then(async (ok) => {
                if (!ok) return;
                onToast(closed ? t("communities.settings.reopenedToast") : t("communities.settings.closedToast"));
                await onChanged();
                setSub(null);
              })
          }
          testId="community-close-page"
        />
      )}
      {sub === "delete" && (
        <SxConfirmPage
          parent={t("ay.manage.dangerRow")}
          title={t("ay.danger.confirmTitle")}
          lead={t("ay.danger.confirmLead", { name: group.name })}
          listLabel={t("ay.danger.willDelete")}
          items={[t("ay.danger.item.members", { count: group.memberCount }), t("ay.danger.item.chat", { count: roomsCount }), t("ay.danger.item.posts"), t("ay.danger.item.requests")]}
          typeLabel={t("ay.danger.typeName")}
          typePlaceholder={group.name}
          typeValue={typed}
          onTypeChange={setTyped}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("ay.danger.deleteTitle")}
          disabled={typed.trim() !== group.name}
          busy={del.busy}
          error={del.error}
          onClose={() => setSub(null)}
          onConfirm={() =>
            void del
              .run(async () => {
                await deleteChatGroup(group.id);
                return true;
              })
              .then((ok) => {
                if (!ok) return;
                void refresh();
                onToast(t("communities.settings.deletedToast"));
                router.push("/communities");
              })
          }
          testId="community-delete-page"
        />
      )}
    </>
  );
}

