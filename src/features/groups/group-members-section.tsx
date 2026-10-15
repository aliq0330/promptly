"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Loader2, MoreVertical, Search, ShieldCheck, UserMinus, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";
import { RoleBadge } from "./role-badge";
import { useAsyncAction } from "./use-async-action";
import {
  fetchChatGroupMembers,
  removeChatGroupMember,
  setChatGroupMemberRole,
  transferChatGroupOwnership,
  type GroupMember,
} from "@/lib/supabase/chat-groups";
import { assignableRoles, canBanMember, canRemoveMember } from "@/lib/chat-groups";
import { cn, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupRole } from "@/types";

type Pending =
  | { kind: "remove"; member: GroupMember }
  | { kind: "role"; member: GroupMember; role: Exclude<GroupRole, "owner"> }
  | { kind: "transfer"; member: GroupMember };

interface Loaded {
  key: string;
  members: GroupMember[];
  hasMore: boolean;
  error: boolean;
}

/**
 * Üye listesi: rol etiketleri, arama, sayfalama ve (yetkiye göre) rol atama / çıkarma / yasaklama / sahiplik devri.
 * Hangi eylemin görüneceği `lib/chat-groups.ts`'teki kurallardan gelir; gerçek yetki sunucudadır (aynı tablo RPC'de).
 */
export function GroupMembersSection({
  group,
  viewerId,
  onChanged,
  onToast,
  showTransferHint = false,
}: {
  group: ChatGroup;
  viewerId: string;
  onChanged: () => void | Promise<void>;
  onToast: (message: string) => void;
  /** Sahip ayrılmadan önce devretmek zorundaysa "Ayrıl" akışından bu sekmeye gelinir ve ipucu gösterilir. */
  showTransferHint?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [ban, setBan] = useState(false);
  const action = useAsyncAction();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const key = `${group.id}|${debounced}|${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    fetchChatGroupMembers(group.id, { search: debounced, offset: 0 })
      .then((page) => {
        if (!cancelled) setLoaded({ key, members: page.members, hasMore: page.hasMore, error: false });
      })
      .catch((err) => {
        console.error("fetchChatGroupMembers", err);
        if (!cancelled) setLoaded({ key, members: [], hasMore: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [group.id, debounced, key]);

  // Menü dışına tıklanınca kapanır.
  useEffect(() => {
    if (!menuFor) return;
    function close(event: MouseEvent) {
      if (!(event.target instanceof Element) || !event.target.closest("[data-member-menu]")) setMenuFor(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuFor(null);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuFor]);

  const current = loaded && loaded.key === key ? loaded : null;
  const viewerRole = group.myRole;

  async function loadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchChatGroupMembers(group.id, { search: debounced, offset: current.members.length });
      setLoaded({ key, members: [...current.members, ...page.members], hasMore: page.hasMore, error: false });
    } catch (err) {
      console.error("fetchChatGroupMembers (more)", err);
      onToast(t("common.actionFailedRetry"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    const done = await action.run(async () => {
      if (pending.kind === "remove") await removeChatGroupMember(group.id, pending.member.userId, { ban });
      else if (pending.kind === "role") await setChatGroupMemberRole(group.id, pending.member.userId, pending.role);
      else await transferChatGroupOwnership(group.id, pending.member.userId);
      return true;
    });
    if (!done) return;
    const name = pending.member.displayName;
    onToast(
      pending.kind === "remove"
        ? t(ban ? "groups.members.bannedToast" : "groups.members.removedToast", { name })
        : pending.kind === "role"
          ? t("groups.members.roleChangedToast", { name })
          : t("groups.members.transferredToast", { name }),
    );
    setPending(null);
    setBan(false);
    setReloadKey((k) => k + 1);
    await onChanged();
  }

  function ask(next: Pending) {
    action.setError(null);
    setBan(false);
    setMenuFor(null);
    setPending(next);
  }

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">{t("groups.members.searchPlaceholder")}</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("groups.members.searchPlaceholder")}
          className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </label>

      {!current ? (
        <p role="status" className="flex items-center justify-center gap-2 py-8 text-small text-text-muted">
          <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
        </p>
      ) : current.error ? (
        <div className="space-y-2 py-8 text-center">
          <p role="alert" className="text-small text-danger">
            {t("groups.members.loadError")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            {t("common.retry")}
          </Button>
        </div>
      ) : current.members.length === 0 ? (
        <EmptyState icon={Users} title={t("groups.members.empty")} compact />
      ) : (
        <>
          <ul className="divide-y divide-border-soft rounded-lg border border-border-soft" aria-label={t("groups.members.listLabel")}>
            {current.members.map((member) => {
              const isMe = member.userId === viewerId;
              const roles = isMe ? [] : assignableRoles(viewerRole, member.role, group.rolePermissions);
              const canRemove = !isMe && canRemoveMember(viewerRole, member.role, group.rolePermissions);
              const canTransfer = !isMe && viewerRole === "owner";
              const hasMenu = roles.length > 0 || canRemove || canTransfer;
              return (
                <li key={member.userId} className="flex items-center gap-3 px-3 py-2.5">
                  <Link href={profileHref({ username: member.username })} className="flex min-w-0 flex-1 items-center gap-3 rounded-md">
                    <Avatar src={member.avatarUrl} alt={member.displayName} size={40} />
                    <span className="min-w-0 leading-tight">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-text">{member.displayName}</span>
                        <RoleBadge role={member.role} />
                        {isMe && <span className="text-caption text-text-muted">({t("groups.members.you")})</span>}
                      </span>
                      <span className="block truncate text-caption text-text-muted">@{member.username}</span>
                    </span>
                  </Link>
                  {hasMenu && (
                    <div className="relative" data-member-menu>
                      <button
                        type="button"
                        aria-label={t("groups.members.actionsFor", { name: member.displayName })}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === member.userId}
                        onClick={() => setMenuFor((prev) => (prev === member.userId ? null : member.userId))}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuFor === member.userId && (
                        <div role="menu" className="absolute right-0 top-10 z-30 w-56 overflow-hidden rounded-md border border-border-soft bg-surface-elevated py-1 shadow-pop animate-pop-in">
                          {roles.map((role) => (
                            <MenuButton
                              key={role}
                              icon={<ShieldCheck size={14} />}
                              label={t(`groups.members.makeRole.${role}`)}
                              onClick={() => ask({ kind: "role", member, role })}
                            />
                          ))}
                          {canTransfer && <MenuButton icon={<UserRound size={14} />} label={t("groups.members.transferOwnership")} onClick={() => ask({ kind: "transfer", member })} />}
                          {canRemove && <MenuButton icon={<UserMinus size={14} />} label={t("groups.members.remove")} danger onClick={() => ask({ kind: "remove", member })} />}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {current.hasMore && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
      {showTransferHint && <p className="rounded-md bg-primary-soft/60 px-3 py-2 text-small text-text">{t("groups.members.transferHint")}</p>}

      {pending && (
        <ConfirmDialog
          id="member-confirm-title"
          title={
            pending.kind === "remove"
              ? t("groups.members.removeTitle", { name: pending.member.displayName })
              : pending.kind === "role"
                ? t("groups.members.roleTitle", { name: pending.member.displayName })
                : t("groups.members.transferTitle", { name: pending.member.displayName })
          }
          body={
            pending.kind === "remove"
              ? t("groups.members.removeBody")
              : pending.kind === "role"
                ? t(`groups.members.roleBody.${pending.role}`)
                : t("groups.members.transferBody")
          }
          confirmLabel={
            pending.kind === "remove"
              ? ban
                ? t("groups.members.removeAndBan")
                : t("groups.members.remove")
              : pending.kind === "role"
                ? t("common.confirm")
                : t("groups.members.transferConfirm")
          }
          danger={pending.kind === "remove" || pending.kind === "transfer"}
          busy={action.busy}
          error={action.error}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        >
          {pending.kind === "remove" && canBanMember(viewerRole, pending.member.role, group.rolePermissions) && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border-soft bg-background px-3 py-2 text-small text-text">
              <input type="checkbox" checked={ban} onChange={(event) => setBan(event.target.checked)} disabled={action.busy} className="mt-0.5 accent-[var(--color-primary)]" />
              <span>
                <span className="flex items-center gap-1 font-medium">
                  <Ban size={13} aria-hidden /> {t("groups.members.banLabel")}
                </span>
                <span className="block text-caption text-text-muted">{t("groups.members.banHelp")}</span>
              </span>
            </label>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function MenuButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft", danger ? "text-danger hover:bg-danger/10" : "text-text")}
    >
      {icon}
      {label}
    </button>
  );
}
