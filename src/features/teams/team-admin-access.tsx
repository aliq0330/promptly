"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "@/components/icons/lock";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  createTeamGroup,
  deleteTeamGroup,
  extendGuest,
  fetchAccessOverview,
  listTeamGroups,
  listTeamGuests,
  listTeamMembers,
  pruneExpiredGuests,
  setGroupMembers,
  updateTeamGroup,
  type TeamAccessOverviewRow,
  type TeamActionError,
  type TeamGroup,
  type TeamGuest,
  type TeamMember,
} from "@/lib/supabase/teams";
import { formatRelativeTime } from "@/lib/utils";
import { InviteDialog } from "./team-invites";
import type { TeamCtx } from "./team-page";
import { SpaceAccessDialog } from "./team-spaces-section";
import { Panel, PersonRow, TEAM_TONES, TeamMark, formatShortDate } from "./team-ui";

/** Yönetim → Space erişimi: ekibin tüm Space'lerinin erişim özeti; satırdan erişim penceresi açılır. */
export function AdminAccessSection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const [rows, setRows] = useState<TeamAccessOverviewRow[] | null>(null);
  const [edit, setEdit] = useState<TeamAccessOverviewRow | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void fetchAccessOverview(ctx.team.id).then(setRows, () => setRows([]));
  }, [ctx.team.id, tick]);
  return (
    <Panel title={t("tm.admin.access")} hint={t("tm.admin.accessHint")}>
      {rows && rows.length === 0 && <p className="text-small text-text-muted">{t("tm.spaces.empty.title")}</p>}
      <ul className="divide-y divide-border-soft" data-testid="team-access-overview">
        {(rows ?? []).map((row) => (
          <li key={row.spaceId} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-small font-medium">
                {row.mode !== "all" && <Lock size={12} aria-hidden />}
                {row.isLibrary ? t("tm.spaces.library") : row.title}
              </p>
              <p className="truncate text-caption text-text-muted">
                {t(row.mode === "all" ? "tm.access.mode.all" : row.mode === "admins" ? "tm.access.mode.admins" : "tm.access.mode.selected")} · {t("tm.spaces.people", { count: row.memberCount })}
                {row.guestCount > 0 && ` · ${t("tm.spaces.guests", { count: row.guestCount })}`} · {formatRelativeTime(row.updatedAt, language)}
              </p>
            </div>
            {!row.isLibrary && (
              <Button type="button" size="sm" variant="outline" onClick={() => setEdit(row)}>
                {t("tm.spaces.access")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {edit && (
        <SpaceAccessDialog
          teamId={ctx.team.id}
          space={{ id: edit.spaceId, title: edit.title, accessMode: edit.mode }}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            setTick((n) => n + 1);
          }}
        />
      )}
    </Panel>
  );
}

/** Yönetim → Gruplar: ekip grupları (tasarım, pazarlama…); grup erişim listelerinde tek satırdır ve lideri klasör onayı verebilir. */
export function AdminGroupsSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { node, show } = useToast();
  const [groups, setGroups] = useState<TeamGroup[] | null>(null);
  const [editing, setEditing] = useState<TeamGroup | "new" | null>(null);
  const [deleting, setDeleting] = useState<TeamGroup | null>(null);
  const load = useCallback(() => {
    void listTeamGroups(ctx.team.id).then(setGroups, () => setGroups([]));
  }, [ctx.team.id]);
  useEffect(load, [load]);
  return (
    <Panel
      title={t("tm.admin.groups")}
      hint={t("tm.admin.groupsHint")}
      action={
        <Button type="button" size="sm" onClick={() => setEditing("new")} data-group-new>
          {t("tm.groups.new")}
        </Button>
      }
    >
      {groups && groups.length === 0 && <p className="text-small text-text-muted">{t("tm.groups.empty")}</p>}
      <ul className="divide-y divide-border-soft" data-testid="team-groups">
        {(groups ?? []).map((group) => (
          <li key={group.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <TeamMark name={group.name} tone={group.tone} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-medium">{group.name}</p>
              <p className="truncate text-caption text-text-muted">
                {t("tm.card.members", { count: group.memberCount })}
                {group.leadName && ` · ${t("tm.groups.lead", { name: group.leadName })}`}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(group)}>
              {t("common.edit")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(group)}>
              {t("common.delete")}
            </Button>
          </li>
        ))}
      </ul>
      {editing && (
        <GroupDialog
          ctx={ctx}
          group={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          id="team-group-delete"
          title={t("tm.groups.deleteTitle", { name: deleting.name })}
          body={t("tm.groups.deleteBody")}
          confirmLabel={t("common.delete")}
          danger
          busy={false}
          error={null}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            void deleteTeamGroup(deleting.id).then(
              () => {
                setDeleting(null);
                load();
              },
              (e: TeamActionError) => {
                show(e.message);
                setDeleting(null);
              },
            );
          }}
        />
      )}
      {node}
    </Panel>
  );
}

function GroupDialog({ ctx, group, onClose, onSaved }: { ctx: TeamCtx; group: TeamGroup | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(group?.name ?? "");
  const [tone, setTone] = useState(group?.tone ?? "primary");
  const [lead, setLead] = useState(group?.leadId ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(group?.memberIds ?? []));
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listTeamMembers(ctx.team.id, "", null, 0).then((page) => setMembers(page.items.filter((m) => m.role !== "guest")), () => undefined);
  }, [ctx.team.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError(t("tm.error.group_invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let id = group?.id;
      if (!id) id = await createTeamGroup(ctx.team.id, name.trim(), tone, lead || null);
      else await updateTeamGroup(id, { name: name.trim(), tone, lead_id: lead || null });
      await setGroupMembers(id, [...selected]);
      onSaved();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SpaceDialog
      title={t(group ? "tm.groups.edit" : "tm.groups.new")}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={(event) => void submit(event)}
      formTestId="team-group-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="group-name" className={fieldLabelClassName}>
            {t("tm.groups.name")}
          </label>
          <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={fieldInputClassName} autoComplete="off" />
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("tm.create.tone")}>
          {TEAM_TONES.map((option) => (
            <button key={option} type="button" role="radio" aria-checked={tone === option} onClick={() => setTone(option)} className={`rounded-xl p-0.5 ${tone === option ? "ring-2 ring-primary" : ""}`}>
              <TeamMark name={name || "?"} tone={option} size={32} />
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="group-lead" className={fieldLabelClassName}>
            {t("tm.groups.leadLabel")}
          </label>
          <select id="group-lead" value={lead} onChange={(e) => setLead(e.target.value)} className={fieldInputClassName}>
            <option value="">{t("tm.groups.noLead")}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName || m.username}
              </option>
            ))}
          </select>
          <p className="mt-1 text-caption text-text-muted">{t("tm.groups.leadHint")}</p>
        </div>
        <div>
          <span className={fieldLabelClassName}>{t("tm.groups.members", { count: selected.size })}</span>
          <ul className="max-h-60 divide-y divide-border-soft overflow-y-auto rounded-lg border border-border-soft px-3">
            {members.map((m) => (
              <li key={m.userId}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={selected.has(m.userId)} onChange={() => toggle(m.userId)} />
                  <PersonRow name={m.displayName || m.username} username={m.username} avatarUrl={m.avatarUrl} className="flex-1" />
                </label>
              </li>
            ))}
          </ul>
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

/** Yönetim → Konuklar: süreli dış kişiler; süresini uzat, süresi dolanları temizle, konuk davet et. */
export function AdminGuestsSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { language } = useTranslation();
  const { node, show } = useToast();
  const [guests, setGuests] = useState<TeamGuest[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const load = useCallback(() => {
    void listTeamGuests(ctx.team.id).then(setGuests, () => setGuests([]));
  }, [ctx.team.id]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) show(done);
      load();
    } catch (e) {
      show((e as TeamActionError).message);
    }
  };
  const expiredCount = (guests ?? []).filter((g) => g.expired).length;
  return (
    <Panel
      title={t("tm.admin.guests")}
      hint={t("tm.admin.guestsHint")}
      action={
        ctx.can("invite_guests") ? (
          <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
            {t("tm.guests.invite")}
          </Button>
        ) : undefined
      }
    >
      {guests && guests.length === 0 && <p className="text-small text-text-muted">{t("tm.guests.empty")}</p>}
      <ul className="divide-y divide-border-soft" data-testid="team-guests">
        {(guests ?? []).map((guest) => (
          <li key={guest.userId}>
            <PersonRow
              name={guest.displayName || guest.username}
              avatarUrl={guest.avatarUrl}
              sub={`${[guest.guestOrg, guest.guestUntil ? t(guest.expired ? "tm.guests.expired" : "tm.members.guestUntil", { date: formatShortDate(guest.guestUntil, language) }) : null].filter(Boolean).join(" · ")}${
                guest.spaces && guest.spaces.length ? ` · ${t("tm.guests.spaces", { names: guest.spaces.map((s) => s.title).join(", ") })}` : ""
              }`}
              right={
                <select
                  aria-label={t("tm.guests.extend")}
                  value=""
                  onChange={(event) => event.target.value && void run(() => extendGuest(ctx.team.id, guest.userId, Number(event.target.value)), t("tm.guests.extended"))}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-caption"
                >
                  <option value="">{t("tm.guests.extend")}</option>
                  {[7, 14, 30, 60].map((d) => (
                    <option key={d} value={d}>
                      +{t("tm.invite.guestDays", { count: d })}
                    </option>
                  ))}
                </select>
              }
            />
          </li>
        ))}
      </ul>
      {expiredCount > 0 && (
        <Button type="button" variant="outline" className="mt-3" onClick={() => void run(() => pruneExpiredGuests(ctx.team.id), t("tm.guests.pruned"))}>
          {t("tm.guests.prune", { count: expiredCount })}
        </Button>
      )}
      {inviteOpen && <InviteDialog ctx={ctx} onClose={() => setInviteOpen(false)} onDone={load} initialRole="guest" />}
      {node}
    </Panel>
  );
}
