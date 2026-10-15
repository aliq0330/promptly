"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, Loader2, Send, Trash2, UserCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field";
import { InviteePicker } from "./invitee-picker";
import { useAsyncAction } from "./use-async-action";
import {
  cancelInvitation,
  createChatGroupLink,
  fetchGroupBans,
  fetchGroupInvitations,
  fetchGroupMemberIds,
  fetchGroupLinks,
  inviteToChatGroup,
  revokeChatGroupLink,
  unbanChatGroupMember,
  type GroupBan,
  type GroupInvitation,
  type GroupLinkInfo,
} from "@/lib/supabase/chat-groups";
import { buildGroupJoinUrl, type InviteResult } from "@/lib/chat-groups";
import { SHARE_BASE_PATH } from "@/lib/share-link";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, UserProfile } from "@/types";

interface Loaded {
  key: string;
  invitations: GroupInvitation[];
  links: GroupLinkInfo[];
  bans: GroupBan[];
  error: boolean;
}

const EXPIRY_OPTIONS = [
  { hours: 1, key: "groups.link.expiry1h" },
  { hours: 24, key: "groups.link.expiry1d" },
  { hours: 168, key: "groups.link.expiry7d" },
  { hours: 720, key: "groups.link.expiry30d" },
] as const;

const USES_OPTIONS = [
  { value: "", key: "groups.link.usesUnlimited" },
  { value: "1", key: "groups.link.uses1" },
  { value: "10", key: "groups.link.uses10" },
  { value: "100", key: "groups.link.uses100" },
] as const;

/**
 * Üye davet etme (owner/admin): kullanıcı arama + takip ettiklerim, bekleyen davetler (iptal), davet bağlantıları
 * (süreli, kullanım sınırlı, iptal edilebilir; ham token yalnızca oluşturulduğu anda gösterilir) ve yasaklı kullanıcılar.
 */
export function GroupInvitesSection({
  group,
  onChanged,
  onToast,
}: {
  group: ChatGroup;
  onChanged: () => void | Promise<void>;
  onToast: (message: string) => void;
}) {
  const { t, language } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<UserProfile[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string> | null>(null);
  const [lastInvite, setLastInvite] = useState<{ result: InviteResult; names: Map<string, string> } | null>(null);
  const [expiry, setExpiry] = useState<number>(168);
  const [maxUses, setMaxUses] = useState("");
  const [freshLink, setFreshLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const invite = useAsyncAction();
  const link = useAsyncAction();
  const rowAction = useAsyncAction();

  const key = `${group.id}|${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGroupInvitations(group.id), fetchGroupLinks(group.id), fetchGroupBans(group.id)])
      .then(([invitations, links, bans]) => {
        if (!cancelled) setLoaded({ key, invitations, links, bans, error: false });
      })
      .catch((err) => {
        console.error("group invites load", err);
        if (!cancelled) setLoaded({ key, invitations: [], links: [], bans: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [group.id, key]);

  // Mevcut üyeler: davet listesinde "zaten üye" göstermek için (yükleme başarısız olursa sunucu yine atlar).
  useEffect(() => {
    let cancelled = false;
    fetchGroupMemberIds(group.id)
      .then((ids) => {
        if (!cancelled) setMemberIds(ids);
      })
      .catch((err) => console.error("fetchGroupMemberIds", err));
    return () => {
      cancelled = true;
    };
  }, [group.id, group.memberCount]);

  const current = loaded && loaded.key === key ? loaded : null;
  const alreadyInvited = useMemo(() => current?.invitations.flatMap((i) => (i.user ? [i.user.id] : [])) ?? [], [current]);

  async function sendInvites() {
    if (selected.length === 0) return;
    const names = new Map(selected.map((p) => [p.id, p.displayName] as const));
    const result = await invite.run(() => inviteToChatGroup(group.id, selected.map((p) => p.id)));
    if (!result) return;
    setLastInvite({ result, names });
    setSelected([]);
    setReloadKey((k) => k + 1);
    await onChanged();
  }

  async function createLink() {
    const created = await link.run(() => createChatGroupLink(group.id, expiry, maxUses ? Number(maxUses) : null));
    if (!created) return;
    setFreshLink({ url: buildGroupJoinUrl(window.location.origin, SHARE_BASE_PATH, created.token), expiresAt: created.expiresAt });
    setReloadKey((k) => k + 1);
  }

  async function copyFresh() {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink.url);
      onToast(t("common.linkCopied"));
    } catch (err) {
      console.error("clipboard", err);
      onToast(t("groups.link.copyFailed"));
    }
  }

  async function runRow(task: () => Promise<void>, toast: string) {
    const ok = await rowAction.run(async () => {
      await task();
      return true;
    });
    if (!ok) return;
    onToast(toast);
    setReloadKey((k) => k + 1);
    await onChanged();
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="invite-people-title" className="space-y-3">
        <h3 id="invite-people-title" className="text-label font-semibold text-text">
          {t("groups.invite.title")}
        </h3>
        <InviteePicker selected={selected} onChange={setSelected} excludeIds={alreadyInvited} memberIds={memberIds} disabled={invite.busy} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-text-muted">{t("groups.invite.help")}</p>
          <Button type="button" size="sm" onClick={() => void sendInvites()} disabled={invite.busy || selected.length === 0}>
            {invite.busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {invite.busy ? t("common.sending") : t("groups.invite.send", { count: selected.length })}
          </Button>
        </div>
        {invite.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {invite.error}
          </p>
        )}
        {lastInvite && (
          <div role="status" className="space-y-1 rounded-md bg-primary-soft/60 px-3 py-2 text-small text-text">
            <p>{t("groups.invite.result", { invited: lastInvite.result.invitedCount, skipped: lastInvite.result.skipped.length })}</p>
            {lastInvite.result.skipped.length > 0 && (
              <ul className="list-disc pl-5 text-text-secondary">
                {lastInvite.result.skipped.map((entry) => (
                  <li key={entry.userId}>
                    {lastInvite.names.get(entry.userId) ?? t("common.genericUser")}: {t(`groups.invite.skip.${entry.reason}`)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {!current ? (
        <p role="status" className="flex items-center justify-center gap-2 py-4 text-small text-text-muted">
          <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
        </p>
      ) : current.error ? (
        <div className="space-y-2 py-4 text-center">
          <p role="alert" className="text-small text-danger">
            {t("groups.invite.loadError")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <>
          {rowAction.error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {rowAction.error}
            </p>
          )}
          <section aria-labelledby="pending-invites-title" className="space-y-2">
            <h3 id="pending-invites-title" className="text-label font-semibold text-text">
              {t("groups.invite.pendingTitle")} ({current.invitations.length})
            </h3>
            {current.invitations.length === 0 ? (
              <p className="text-small text-text-muted">{t("groups.invite.pendingEmpty")}</p>
            ) : (
              <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
                {current.invitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar src={invitation.user?.avatarUrl} alt={invitation.user?.displayName ?? ""} size={36} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-semibold text-text">{invitation.user?.displayName}</span>
                      <span className="block truncate text-caption text-text-muted">
                        @{invitation.user?.username} · {formatRelativeTime(invitation.createdAt, language)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={rowAction.busy}
                      onClick={() => void runRow(() => cancelInvitation(invitation.id), t("groups.invite.cancelledToast"))}
                      aria-label={t("groups.invite.cancelFor", { name: invitation.user?.displayName ?? "" })}
                    >
                      {t("groups.invite.cancel")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="links-title" className="space-y-3">
            <h3 id="links-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
              <Link2 size={14} aria-hidden /> {t("groups.link.title")}
            </h3>
            <p className="text-caption text-text-muted">{group.visibility === "public" ? t("groups.link.helpPublic") : t("groups.link.helpPrivate")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="link-expiry" className={fieldLabelClassName}>
                  {t("groups.link.expiry")}
                </label>
                <select id="link-expiry" value={expiry} onChange={(event) => setExpiry(Number(event.target.value))} disabled={link.busy} className={`${fieldControlClassName} h-10`}>
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option.hours} value={option.hours}>
                      {t(option.key)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="link-uses" className={fieldLabelClassName}>
                  {t("groups.link.maxUses")}
                </label>
                <select id="link-uses" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} disabled={link.busy} className={`${fieldControlClassName} h-10`}>
                  {USES_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.key)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void createLink()} disabled={link.busy}>
              {link.busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              {link.busy ? t("common.creating") : t("groups.link.create")}
            </Button>
            {link.error && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
                {link.error}
              </p>
            )}
            {freshLink && (
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary-soft/40 p-3">
                <p className="text-caption text-text-secondary">{t("groups.link.shownOnce")}</p>
                <div className="flex gap-2">
                  <input readOnly value={freshLink.url} aria-label={t("groups.link.title")} onFocus={(event) => event.currentTarget.select()} className={`${fieldControlClassName} h-10 min-w-0 flex-1 font-mono text-xs`} />
                  <Button type="button" size="sm" onClick={() => void copyFresh()}>
                    <Copy size={14} /> {t("common.copy")}
                  </Button>
                </div>
              </div>
            )}
            {current.links.length > 0 && (
              <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
                {current.links.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1 text-small leading-tight text-text-secondary">
                      <span className="block">{t("groups.link.expiresAt", { date: new Date(item.expiresAt).toLocaleString(language === "en" ? "en-US" : "tr-TR") })}</span>
                      <span className="block text-caption text-text-muted">
                        {item.maxUses ? t("groups.link.usageLimited", { used: item.useCount, max: item.maxUses }) : t("groups.link.usageUnlimited", { used: item.useCount })}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={rowAction.busy}
                      onClick={() => void runRow(() => revokeChatGroupLink(item.id), t("groups.link.revokedToast"))}
                    >
                      <Trash2 size={14} /> {t("groups.link.revoke")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {current.bans.length > 0 && (
            <section aria-labelledby="bans-title" className="space-y-2">
              <h3 id="bans-title" className="text-label font-semibold text-text">
                {t("groups.bans.title")} ({current.bans.length})
              </h3>
              <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
                {current.bans.map((ban) => (
                  <li key={ban.userId} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar src={ban.user?.avatarUrl} alt={ban.user?.displayName ?? ""} size={36} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-semibold text-text">{ban.user?.displayName ?? t("common.genericUser")}</span>
                      {ban.reason && <span className="block truncate text-caption text-text-muted">{ban.reason}</span>}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={rowAction.busy}
                      onClick={() => void runRow(() => unbanChatGroupMember(group.id, ban.userId), t("groups.bans.unbannedToast"))}
                    >
                      <UserCheck size={14} /> {t("groups.bans.unban")}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
