"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "@/components/icons/chevron-down";
import { Lock } from "@/components/icons/lock";
import { Plus } from "@/components/icons/plus";
import { Avatar } from "@/components/ui/avatar";
import { PresenceStatusText } from "@/features/presence/presence-ui";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  createTeamGroup,
  deleteTeamGroup,
  extendGuest,
  listTeamGroups,
  listTeamGuests,
  listTeamMembers,
  pruneExpiredGuests,
  setGroupMembers,
  updateTeamGroup,
  type TeamActionError,
  type TeamGroup,
  type TeamGuest,
  type TeamMember,
} from "@/lib/supabase/teams";
import { cn } from "@/lib/utils";
import { InviteDialog } from "./team-invites";
import type { TeamCtx } from "./team-page";
import { PersonRow, StatTile, TEAM_TONES, TeamMark } from "./team-ui";

/** Yönetim → Gruplar: ekip grupları (tasarım, pazarlama…); grup erişim listelerinde tek satırdır ve lideri klasör onayı verebilir. */
export function AdminGroupsSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { node, show } = useToast();
  const [groups, setGroups] = useState<TeamGroup[] | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const wide = useMediaQuery("(min-width: 768px)");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamGroup | "new" | null>(null);
  const [deleting, setDeleting] = useState<TeamGroup | null>(null);
  const load = useCallback(() => {
    void listTeamGroups(ctx.team.id).then(setGroups, () => setGroups([]));
    // Üye çipleri için ekibin ilk sayfası (≤30): daha büyük ekipte grubun tüm üyeleri çip olmaz, kalanı "+N kişi" diye sayılır.
    void listTeamMembers(ctx.team.id, "", null, 0).then((page) => setMembers(page.items), () => undefined);
  }, [ctx.team.id]);
  useEffect(load, [load]);

  const list = groups ?? [];
  const selected = list.find((g) => g.id === selectedId) ?? list[0] ?? null;

  const card = "rounded-xl border border-border-soft bg-surface p-4";
  const detail = selected && (
    <div className="space-y-3" data-group-detail={selected.id}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0 max-md:hidden">
          <h3 className="font-display text-h3 font-bold">{selected.name}</h3>
          <p className="text-small text-text-secondary">
            {t("tm.card.members", { count: selected.memberCount })}
            {selected.leadName && ` · ${t("tm.groups.leadFull", { name: selected.leadName })}`}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(selected)} data-group-edit>
          {t("common.edit")}
        </Button>
        <Button type="button" size="sm" onClick={() => setEditing(selected)} data-group-add-members>
          {t("tm.groups.addMembers")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(selected)} data-group-delete>
          {t("common.delete")}
        </Button>
      </div>
      <GroupMembersCard group={selected} members={members} />
      <section className={card} data-group-spaces>
        <h4 className="mb-2 text-small font-bold">{t("tm.groups.spaceAccess", { count: selected.spaces?.length ?? 0 })}</h4>
        {(selected.spaces ?? []).length === 0 ? (
          <p className="text-small text-text-muted">{t("tm.groups.noSpaces")}</p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {(selected.spaces ?? []).map((space) => (
              <li key={space.spaceId} className="flex items-center justify-between gap-3 py-2 text-small">
                <span className="min-w-0 truncate font-bold">{space.title}</span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-caption font-bold", space.level === "edit" ? "bg-success/10 text-success" : "bg-surface-soft text-text-secondary")}>
                  {t(space.level === "edit" ? "tm.groups.canEdit" : "tm.groups.viewOnly")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="team-groups">
      <div className="flex flex-wrap items-center gap-2 max-md:hidden">
        <div className="mr-auto">
          <h2 className="font-display text-h2 font-bold">{t("tm.admin.groups")}</h2>
          <p className="text-small text-text-secondary">{t("tm.admin.groupsHint")}</p>
        </div>
      </div>
      {groups && groups.length === 0 && <p className="text-small text-text-muted">{t("tm.groups.empty")}</p>}
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ul className="space-y-2" data-group-list>
          {list.map((group) => {
            const on = selected?.id === group.id;
            return (
              <li key={group.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(group.id)}
                  aria-pressed={on}
                  data-group-item={group.id}
                  className={cn("flex w-full items-center gap-3 rounded-xl border bg-surface p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", on ? "border-2 border-primary" : "border-border-soft hover:border-border-strong")}
                >
                  <TeamMark name={group.name} tone={group.tone} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-bold">{group.name}</span>
                    <span className="block truncate text-caption text-text-muted">
                      {t("tm.card.members", { count: group.memberCount })}
                      {group.leadName && <span className="md:hidden">{` · ${t("tm.groups.leadFull", { name: group.leadName })}`}</span>}
                    </span>
                  </span>
                  <ChevronDown size={16} className={cn("shrink-0 text-text-muted transition-transform md:hidden", on && "rotate-180")} aria-hidden />
                </button>
                {on && !wide && <div className="mt-2">{detail}</div>}
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setEditing("new")} data-group-new className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-small font-bold text-text-secondary hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Plus size={16} aria-hidden />
              {t("tm.groups.new")}
            </button>
          </li>
        </ul>
        {wide && <div>{detail}</div>}
      </div>
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
                setSelectedId(null);
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
    </div>
  );
}

/** Grubun üyeleri çip olarak (lider rozetli); ekibin yüklenen ilk sayfasında olmayanlar "+N kişi" diye sayılır. */
function GroupMembersCard({ group, members }: { group: TeamGroup; members: TeamMember[] }) {
  const { t } = useTranslation();
  const ids = new Set(group.memberIds ?? []);
  const inGroup = members.filter((m) => ids.has(m.userId) || (m.groupIds ?? []).includes(group.id));
  const shown = inGroup.slice(0, 8);
  const rest = Math.max(0, group.memberCount - shown.length);
  return (
    <section className="rounded-xl border border-border-soft bg-surface p-4" data-group-members>
      <h4 className="mb-2 text-small font-bold">{t("tm.groups.membersHeading")}</h4>
      <div className="flex flex-wrap gap-2">
        {shown.map((m) => (
          <span key={m.userId} className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft py-1 pl-1 pr-3 text-caption font-bold text-text">
            <Avatar src={m.avatarUrl} alt={m.displayName || m.username} size={22} />
            {m.displayName || m.username}
            {group.leadId === m.userId && <span className="rounded-full bg-primary-soft px-1.5 text-[0.6875rem] text-primary">{t("tm.groups.leadBadge")}</span>}
          </span>
        ))}
        {rest > 0 && <span className="inline-flex items-center rounded-full border border-border-soft px-3 py-1 text-caption font-bold text-text-muted">{t("tm.groups.more", { count: rest })}</span>}
      </div>
    </section>
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
  const [now] = useState(() => Date.now());
  const list = guests ?? [];
  const daysLeft = (guest: TeamGuest) => (guest.guestUntil ? Math.ceil((new Date(guest.guestUntil).getTime() - now) / 86_400_000) : null);
  const active = list.filter((g) => !g.expired);
  const soon = active.filter((g) => (daysLeft(g) ?? 99) <= 7).length;
  const expiredCount = list.length - active.length;
  const inviterRole = ctx.policy?.guestInviteRole ?? "admin";

  const leftChip = (guest: TeamGuest) => {
    const left = daysLeft(guest);
    if (guest.expired || left === null) return <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-caption font-bold text-danger">{t("tm.guests.expiredChip")}</span>;
    return <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-bold", left <= 7 ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>{t("tm.guests.daysLeft", { count: Math.max(left, 0) })}</span>;
  };
  const levelChip = (guest: TeamGuest) => {
    const canEdit = (guest.spaces ?? []).some((space) => space.role === "editor" || space.role === "owner");
    return <span className="whitespace-nowrap rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-bold text-text-secondary">{t(canEdit ? "tm.groups.canEdit" : "tm.groups.viewOnly")}</span>;
  };
  const extend = (guest: TeamGuest) => (
    <select
      aria-label={t("tm.guests.extend")}
      value=""
      onChange={(event) => event.target.value && void run(() => extendGuest(ctx.team.id, guest.userId, Number(event.target.value)), t("tm.guests.extended"))}
      className="h-9 rounded-full border border-border bg-surface px-3 text-caption font-bold text-primary"
      data-guest-extend
    >
      <option value="">{t("tm.guests.extend")}</option>
      {[7, 14, 30, 60].map((d) => (
        <option key={d} value={d}>
          +{t("tm.invite.guestDays", { count: d })}
        </option>
      ))}
    </select>
  );
  const spacesText = (guest: TeamGuest) => (guest.spaces ?? []).map((space) => space.title).join(", ") || "—";
  const invite = ctx.can("invite_guests") && (
    <Button type="button" onClick={() => setInviteOpen(true)} data-guest-invite>
      <Plus size={16} aria-hidden />
      {t("tm.guests.invite")}
    </Button>
  );
  const hidden = ["tm.guests.hide.chat", "tm.guests.hide.members", "tm.guests.hide.panel", "tm.guests.hide.admin", "tm.guests.hide.spaces"] as const;

  return (
    <div className="space-y-4" data-testid="team-guests-page">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0 max-md:hidden">
          <h2 className="font-display text-h2 font-bold">{t("tm.admin.guests")}</h2>
          <p className="text-small text-text-secondary">{t("tm.admin.guestsHint")}</p>
        </div>
        <div className="max-md:ml-auto">{invite}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" data-guest-stats>
        <StatTile label={t("tm.guests.statActive")} value={active.length} />
        <StatTile label={t("tm.guests.statSoon")} value={<span className={soon > 0 ? "text-warning" : undefined}>{soon}</span>} />
        <div className="max-md:hidden">
          <StatTile label={t("tm.guests.statInviter")} value={t(`tm.role.${inviterRole}` as "tm.role.admin")} />
        </div>
      </div>
      {guests && guests.length === 0 && <p className="text-small text-text-muted">{t("tm.guests.empty")}</p>}
      {list.length > 0 && (
        <>
          <table className="hidden w-full overflow-hidden rounded-xl border border-border-soft bg-surface text-small md:table" data-testid="team-guests">
            <thead className="bg-surface-soft text-caption uppercase tracking-[0.06em] text-text-muted">
              <tr className="text-left">
                {(["tm.guests.col.guest", "tm.guests.col.spaces", "tm.guests.col.level", "tm.guests.col.until", "tm.guests.col.lastSeen", "tm.guests.col.actions"] as const).map((key) => (
                  <th key={key} className="px-4 py-2.5 font-bold">
                    {key === "tm.guests.col.actions" ? <span className="sr-only">{t(key)}</span> : t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {list.map((guest) => (
                <tr key={guest.userId} data-guest-row>
                  <td className="px-4 py-3">
                    <PersonRow name={guest.displayName || guest.username} avatarUrl={guest.avatarUrl} sub={guest.guestOrg ?? undefined} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{spacesText(guest)}</td>
                  <td className="px-4 py-3">{levelChip(guest)}</td>
                  <td className="px-4 py-3">{leftChip(guest)}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    <PresenceStatusText userId={guest.userId} fallback="—" showDot={false} />
                  </td>
                  <td className="px-4 py-3 text-right">{extend(guest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="space-y-2 md:hidden" data-testid="team-guests-cards">
            {list.map((guest) => (
              <li key={guest.userId} className="rounded-xl border border-border-soft bg-surface p-3.5" data-guest-card>
                <div className="flex items-center gap-3">
                  <PersonRow name={guest.displayName || guest.username} avatarUrl={guest.avatarUrl} sub={guest.guestOrg ?? undefined} className="flex-1" />
                  {leftChip(guest)}
                </div>
                <p className="mt-2 text-small text-text-secondary">{spacesText(guest)}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  {levelChip(guest)}
                  <span className="min-w-0 flex-1 truncate text-caption text-text-muted">
                    {t("tm.guests.lastSeenPrefix")} <PresenceStatusText userId={guest.userId} fallback="—" showDot={false} />
                  </span>
                  {extend(guest)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {expiredCount > 0 && (
        <Button type="button" variant="outline" onClick={() => void run(() => pruneExpiredGuests(ctx.team.id), t("tm.guests.pruned"))}>
          {t("tm.guests.prune", { count: expiredCount })}
        </Button>
      )}
      <section className="rounded-xl border border-border-soft bg-surface p-4" data-guest-hidden>
        <h3 className="mb-2 text-small font-bold">{t("tm.guests.cannotSee")}</h3>
        <div className="flex flex-wrap gap-2">
          {hidden.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1 text-caption font-bold text-text-secondary">
              <Lock size={12} aria-hidden />
              {t(key)}
            </span>
          ))}
        </div>
      </section>
      {inviteOpen && <InviteDialog ctx={ctx} onClose={() => setInviteOpen(false)} onDone={load} initialRole="guest" />}
      {node}
    </div>
  );
}
