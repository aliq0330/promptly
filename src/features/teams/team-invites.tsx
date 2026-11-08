"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy } from "@/components/icons/copy";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  cancelInvitation,
  createInviteLink,
  inviteUser,
  listInviteLinks,
  listPendingInvites,
  revokeInviteLink,
  type TeamActionError,
  type TeamInviteLink,
  type TeamPendingInvite,
} from "@/lib/supabase/teams";
import type { TeamRole } from "@/lib/teams";
import { absoluteUrl } from "@/lib/utils";
import type { TeamCtx } from "./team-page";
import { Panel, PersonRow, PillChoice, RoleChip, formatShortDate, roleLabelKey } from "./team-ui";

/** Davet edilebilecek roller: sahip atanmaz; konuk yalnız `invite_guests` yetkisiyle (sunucu de denetler). */
function inviteRoles(ctx: TeamCtx): TeamRole[] {
  const roles: TeamRole[] = ["member", "editor"];
  if (ctx.team.myRole === "owner") roles.push("admin");
  if (ctx.can("invite_guests")) roles.push("guest");
  return roles;
}

export function joinLinkUrl(token: string): string {
  return absoluteUrl(`/team-join#${token}`);
}

/** Davet penceresi: kullanıcı adıyla davet ya da bağlantı. Alan adı (e-posta alanı) ile katılma YOKTUR (kullanıcı kararı). */
export function InviteDialog({ ctx, onClose, onDone, initial = "user", initialRole }: { ctx: TeamCtx; onClose: () => void; onDone: () => void; initial?: "user" | "link"; initialRole?: TeamRole }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"user" | "link">(initial);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<TeamRole>(initialRole ?? ctx.policy?.defaultMemberRole ?? "member");
  const [guestDays, setGuestDays] = useState(14);
  const [guestOrg, setGuestOrg] = useState("");
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const roles = mode === "link" ? inviteRoles(ctx).filter((r) => r === "member" || r === "editor") : inviteRoles(ctx);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "user") {
        if (!username.trim()) throw new Error(t("tm.invite.usernameRequired"));
        await inviteUser(ctx.team.id, username, role, role === "guest" ? guestDays : null, role === "guest" ? guestOrg.trim() || null : null);
        setSent(true);
        setUsername("");
        onDone();
      } else {
        const link = await createInviteLink(ctx.team.id, role, maxUses, ctx.policy?.inviteLinkTtlDays ?? null);
        setCreated(joinLinkUrl(link.token));
        onDone();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tm.invite.title")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-invite-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </Button>
          {!created && (
            <Button type="submit" disabled={busy}>
              {t(mode === "user" ? "tm.invite.send" : "tm.invite.createLink")}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <PillChoice<"user" | "link">
          ariaLabel={t("tm.invite.title")}
          value={mode}
          onChange={(next) => {
            setMode(next);
            if (next === "link" && (role === "guest" || role === "admin")) setRole("member");
            setCreated(null);
            setSent(false);
          }}
          options={[
            { key: "user", label: t("tm.invite.byUsername") },
            { key: "link", label: t("tm.invite.byLink") },
          ]}
        />
        {mode === "user" && (
          <div>
            <label htmlFor="team-invite-username" className={fieldLabelClassName}>
              {t("tm.invite.username")}
            </label>
            <input id="team-invite-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@kullanici" className={fieldInputClassName} autoComplete="off" autoCapitalize="none" />
          </div>
        )}
        <div>
          <span className={fieldLabelClassName}>{t("tm.invite.role")}</span>
          <PillChoice<TeamRole> ariaLabel={t("tm.invite.role")} value={role} onChange={setRole} options={roles.map((key) => ({ key, label: t(roleLabelKey(key)) }))} />
          <p className="mt-1.5 text-caption text-text-muted">{t(`tm.invite.roleHint.${role}` as "tm.invite.roleHint.member")}</p>
        </div>
        {role === "guest" && mode === "user" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="team-guest-days" className={fieldLabelClassName}>
                {t("tm.invite.guestDaysLabel")}
              </label>
              <select id="team-guest-days" value={guestDays} onChange={(e) => setGuestDays(Number(e.target.value))} className={fieldInputClassName}>
                {[7, 14, 30, 60, 90].map((days) => (
                  <option key={days} value={days}>
                    {t("tm.invite.guestDays", { count: days })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="team-guest-org" className={fieldLabelClassName}>
                {t("tm.invite.guestOrg")}
              </label>
              <input id="team-guest-org" value={guestOrg} onChange={(e) => setGuestOrg(e.target.value)} maxLength={80} className={fieldInputClassName} />
            </div>
          </div>
        )}
        {mode === "link" && (
          <div>
            <label htmlFor="team-link-uses" className={fieldLabelClassName}>
              {t("tm.invite.maxUses")}
            </label>
            <select id="team-link-uses" value={maxUses ?? 0} onChange={(e) => setMaxUses(Number(e.target.value) || null)} className={fieldInputClassName}>
              <option value={0}>{t("tm.invite.unlimited")}</option>
              {[1, 5, 10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        {mode === "link" && <p className="text-caption text-text-muted">{t("tm.invite.linkRoles")}</p>}
        {sent && <p className="text-small text-success">{t("tm.invite.sent")}</p>}
        {created && (
          <div className="space-y-2 rounded-lg bg-primary-soft/40 p-3">
            <p className="text-caption text-text-secondary">{t("tm.invite.linkOnce")}</p>
            <div className="flex gap-2">
              <input readOnly value={created} aria-label={t("tm.invite.byLink")} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-caption" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void navigator.clipboard?.writeText(created)}>
                <Copy size={14} aria-hidden />
                {t("common.copy")}
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}

/** Bekleyen kullanıcı davetleri + etkin davet bağlantıları (Yönetim → Davetler). */
export function InvitesPanel({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { node: toastNode, show } = useToast();
  const [invites, setInvites] = useState<TeamPendingInvite[] | null>(null);
  const [links, setLinks] = useState<TeamInviteLink[] | null>(null);
  const [dialog, setDialog] = useState<"user" | "link" | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(() => {
    void listPendingInvites(ctx.team.id).then(setInvites, () => setInvites([]));
    void listInviteLinks(ctx.team.id).then(setLinks, () => setLinks([]));
  }, [ctx.team.id]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (e) {
      show((e as TeamActionError).message);
    }
  };

  return (
    <div className="space-y-4" data-testid="team-invites-panel">
      <Panel
        title={t("tm.admin.invites.pending")}
        hint={t("tm.admin.invites.pendingHint")}
        action={
          <Button type="button" size="sm" onClick={() => setDialog("user")} data-team-invite>
            {t("tm.invite.title")}
          </Button>
        }
      >
        {invites && invites.length === 0 && <p className="text-small text-text-muted">{t("tm.admin.invites.none")}</p>}
        <ul className="divide-y divide-border-soft">
          {(invites ?? []).map((invite) => (
            <li key={invite.id}>
              <PersonRow
                name={invite.inviteeName || invite.inviteeUsername}
                username={invite.inviteeUsername}
                avatarUrl={invite.inviteeAvatarUrl}
                right={
                  <>
                    <RoleChip role={invite.role} />
                    <button type="button" onClick={() => void run(() => cancelInvitation(invite.id))} aria-label={t("tm.admin.invites.cancel")} className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-soft">
                      <X size={14} aria-hidden />
                    </button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title={t("tm.admin.invites.links")}
        hint={t("tm.admin.invites.linksHint")}
        action={
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog("link")} data-team-link-new>
            {t("tm.invite.createLink")}
          </Button>
        }
      >
        {links && links.length === 0 && <p className="text-small text-text-muted">{t("tm.admin.invites.noLinks")}</p>}
        <ul className="divide-y divide-border-soft">
          {(links ?? []).map((link) => {
            const dead = Boolean(link.revokedAt) || new Date(link.expiresAt).getTime() < now || (link.maxUses !== null && link.useCount >= link.maxUses);
            return (
              <li key={link.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium">
                    <RoleChip role={link.role} />{" "}
                    <span className="text-text-muted">
                      {t("tm.admin.invites.uses", { used: link.useCount, max: link.maxUses ?? "∞" })} · {t("tm.admin.invites.until", { date: formatShortDate(link.expiresAt, language) })}
                    </span>
                  </p>
                  <p className="text-caption text-text-muted">{t("tm.admin.invites.by", { name: link.createdByName })}</p>
                </div>
                {dead ? (
                  <span className="text-caption text-text-muted">{t(link.revokedAt ? "tm.admin.invites.revoked" : "tm.admin.invites.expired")}</span>
                ) : (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void run(() => revokeInviteLink(link.id))}>
                    {t("tm.admin.invites.revoke")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      {toastNode}
      {dialog && <InviteDialog ctx={ctx} initial={dialog} onClose={() => setDialog(null)} onDone={load} />}
    </div>
  );
}
