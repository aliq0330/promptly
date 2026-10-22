"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Crown, Eye, Loader2, LogOut, PenLine, Share2, UserMinus, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import { SPACE_ROLE_LABEL, SPACE_VISIBILITY_LABEL, type SpaceRole } from "@/lib/spaces";
import {
  fetchPendingSpaceInvitations,
  fetchSpaceMembers,
  inviteSpaceMember,
  removeSpaceMember,
  revokeSpaceInvitation,
  setSpaceMemberRole,
  type SpaceInvitation,
  type SpaceMember,
} from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";
import { FormError } from "../space-forms";
import { ShareSpaceModal } from "../space-modals";
import { VisibilityBadge } from "../space-visuals";

const ROLE_ICON: Record<SpaceRole, typeof Crown> = { owner: Crown, editor: PenLine, viewer: Eye };

/**
 * Üyeler ve erişim (docs/history/213-*; yalnız üyelere görünür): üye listesi, sahibe rol değiştirme / çıkarma / kullanıcı adıyla
 * davet / bekleyen davetleri geri alma, paylaşım özeti; sahip olmayan üyeye "Space'ten ayrıl". Gerçek zamanlı ortak düzenleme YOK:
 * değişiklikler kaydedilir, başkalarının değişiklikleri sayfa yenilenince görünür (sayfada söylenir).
 */
export function MembersTab() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { space, setSpace, caps, userId } = useSpaceContext();
  const [members, setMembers] = useState<SpaceMember[] | null>(null);
  const [invites, setInvites] = useState<SpaceInvitation[]>([]);
  const [failed, setFailed] = useState(false);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "remove"; member: SpaceMember } | { kind: "leave" }>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const inputId = useId();
  const roleId = useId();

  const load = useCallback(async () => {
    try {
      const [list, pending] = await Promise.all([fetchSpaceMembers(space.id), caps.manageMembers ? fetchPendingSpaceInvitations(space.id) : Promise.resolve([])]);
      setMembers(list);
      setInvites(pending);
    } catch {
      setFailed(true);
    }
  }, [space.id, caps.manageMembers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch; state is set when the response arrives
    void load();
  }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await inviteSpaceMember(space.id, username, role);
      setNotice(t("spaces.members.invited", { name: username.trim().replace(/^@/, "") }));
      setUsername("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: SpaceMember, next: "editor" | "viewer") {
    setError(null);
    const previous = members;
    setMembers((list) => list?.map((entry) => (entry.userId === member.userId ? { ...entry, role: next } : entry)) ?? list);
    try {
      await setSpaceMemberRole(space.id, member.userId, next);
    } catch (err) {
      setMembers(previous);
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="space-members">
      <div className="min-w-0 space-y-6">
        {caps.manageMembers && (
          <form onSubmit={invite} className="space-y-3 rounded-lg border border-border-soft bg-surface p-4" data-testid="invite-member">
            <h2 className="text-h3 font-semibold text-text">{t("spaces.members.inviteTitle")}</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor={inputId} className={fieldLabelClassName}>
                  {t("spaces.members.username")}
                </label>
                <input id={inputId} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@kullanici" autoComplete="off" autoCapitalize="none" spellCheck={false} className={fieldInputClassName} />
              </div>
              <div>
                <label htmlFor={roleId} className={fieldLabelClassName}>
                  {t("spaces.members.role")}
                </label>
                <select id={roleId} value={role} onChange={(event) => setRole(event.target.value as "editor" | "viewer")} className={cn(fieldInputClassName, "sm:w-40")}>
                  <option value="viewer">{t(SPACE_ROLE_LABEL.viewer)}</option>
                  <option value="editor">{t(SPACE_ROLE_LABEL.editor)}</option>
                </select>
              </div>
              <Button type="submit" disabled={busy || !username.trim()} className="h-11">
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <UserPlus size={16} aria-hidden />}
                {t("spaces.members.invite")}
              </Button>
            </div>
            {notice && (
              <p role="status" className="text-small text-success">
                {notice}
              </p>
            )}
          </form>
        )}
        <FormError message={error} />

        <section className="space-y-2">
          <h2 className="text-h3 font-semibold text-text">{t("spaces.members.title")}</h2>
          {failed ? (
            <p className="text-small text-text-muted">{t("spaces.members.loadError")}</p>
          ) : members === null ? (
            <p className="text-small text-text-muted">{t("common.loading")}</p>
          ) : (
            <ul className="divide-y divide-border-soft rounded-lg border border-border-soft bg-surface">
              {members.map((member) => {
                const Icon = ROLE_ICON[member.role];
                const name = member.profile?.displayName ?? "—";
                return (
                  <li key={member.userId} data-member={member.profile?.username ?? member.userId} className="flex items-center gap-3 p-3">
                    {member.profile ? (
                      <Link href={profileHref(member.profile)} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar src={member.profile.avatarUrl} alt="" size={36} />
                        <span className="min-w-0">
                          <span className="block truncate text-small font-semibold text-text">
                            {name}
                            {member.userId === userId && <span className="font-normal text-text-muted"> · {t("spaces.card.you")}</span>}
                          </span>
                          <span className="block truncate text-caption text-text-muted">@{member.profile.username}</span>
                        </span>
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 text-small text-text-muted">—</span>
                    )}
                    {caps.manageMembers && member.role !== "owner" ? (
                      <>
                        <select
                          value={member.role}
                          onChange={(event) => void changeRole(member, event.target.value as "editor" | "viewer")}
                          aria-label={t("spaces.members.roleOf", { name })}
                          className="h-9 rounded-full border border-border bg-surface px-3 text-caption font-medium text-text"
                        >
                          <option value="viewer">{t(SPACE_ROLE_LABEL.viewer)}</option>
                          <option value="editor">{t(SPACE_ROLE_LABEL.editor)}</option>
                        </select>
                        <button type="button" onClick={() => setConfirm({ kind: "remove", member })} aria-label={t("spaces.members.remove", { name })} className="rounded-full p-2 text-text-muted hover:bg-danger/10 hover:text-danger">
                          <UserMinus size={16} />
                        </button>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2.5 py-1 text-caption font-medium text-text-secondary">
                        <Icon size={12} aria-hidden />
                        {t(SPACE_ROLE_LABEL[member.role])}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {caps.manageMembers && invites.length > 0 && (
          <section className="space-y-2" data-testid="pending-invites">
            <h2 className="text-h3 font-semibold text-text">{t("spaces.members.pending")}</h2>
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
                  <Avatar src={invite.invitee?.avatarUrl ?? null} alt="" size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium text-text">{invite.invitee?.displayName ?? "—"}</span>
                    <span className="block text-caption text-text-muted">
                      {t(SPACE_ROLE_LABEL[invite.role])} · {formatRelativeTime(invite.createdAt, language)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      setError(null);
                      try {
                        await revokeSpaceInvitation(invite.id);
                        setInvites((list) => list.filter((entry) => entry.id !== invite.id));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : t("spaces.error.generic"));
                      }
                    }}
                  >
                    <X size={14} aria-hidden />
                    {t("spaces.members.revokeInvite")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {caps.leave && (
          <Button variant="outline" className="text-danger" onClick={() => setConfirm({ kind: "leave" })}>
            <LogOut size={16} aria-hidden />
            {t("spaces.card.leave")}
          </Button>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="space-y-2 rounded-lg border border-border-soft bg-surface p-4">
          <h2 className="text-label font-semibold uppercase tracking-[0.08em] text-text-muted">{t("spaces.members.access")}</h2>
          <VisibilityBadge visibility={space.visibility} />
          <p className="text-small text-text-secondary">{t(SPACE_VISIBILITY_LABEL[space.visibility])}</p>
          {caps.share && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 size={14} aria-hidden />
              {t("spaces.members.shareSettings")}
            </Button>
          )}
        </section>
        <section className="space-y-2 rounded-lg border border-border-soft bg-surface p-4 text-small text-text-secondary">
          <h2 className="text-label font-semibold uppercase tracking-[0.08em] text-text-muted">{t("spaces.members.rolesTitle")}</h2>
          {(["owner", "editor", "viewer"] as const).map((key) => {
            const Icon = ROLE_ICON[key];
            return (
              <p key={key} className="flex gap-2">
                <Icon size={15} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
                <span>
                  <span className="font-semibold text-text">{t(SPACE_ROLE_LABEL[key])}:</span> {t(`spaces.members.roleHelp.${key}`)}
                </span>
              </p>
            );
          })}
          <p className="border-t border-border-soft pt-2 text-caption text-text-muted">{t("spaces.members.noRealtime")}</p>
        </section>
      </aside>

      {confirm?.kind === "remove" && (
        <ConfirmDialog
          id="remove-space-member"
          title={t("spaces.members.removeTitle", { name: confirm.member.profile?.displayName ?? "—" })}
          body={t("spaces.members.removeBody")}
          confirmLabel={t("spaces.members.removeConfirm")}
          danger
          busy={busy}
          error={error}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setBusy(true);
            setError(null);
            try {
              await removeSpaceMember(space.id, confirm.member.userId);
              setMembers((list) => list?.filter((entry) => entry.userId !== confirm.member.userId) ?? list);
              setConfirm(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : t("spaces.error.generic"));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {confirm?.kind === "leave" && userId && (
        <ConfirmDialog
          id="leave-space-members"
          title={t("spaces.leave.title")}
          body={t("spaces.leave.body", { title: space.title })}
          confirmLabel={t("spaces.leave.confirm")}
          danger
          busy={busy}
          error={error}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setBusy(true);
            setError(null);
            try {
              await removeSpaceMember(space.id, userId);
              router.replace("/spaces");
            } catch (err) {
              setError(err instanceof Error ? err.message : t("spaces.error.generic"));
              setBusy(false);
            }
          }}
        />
      )}
      {shareOpen && <ShareSpaceModal space={space} onClose={() => setShareOpen(false)} onChanged={setSpace} />}
    </div>
  );
}
