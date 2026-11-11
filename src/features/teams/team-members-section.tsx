"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "@/components/icons/check";
import { ChevronRight } from "@/components/icons/chevron-right";
import { Search } from "@/components/icons/search";
import { UserMinus } from "@/components/icons/user-minus";
import { Button } from "@/components/ui/button";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useToast } from "@/features/groups/use-toast";
import { PresenceAvatar, PresenceStatusText } from "@/features/presence/presence-ui";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchMemberProjectRoles, type MemberProjectRoles } from "@/lib/supabase/team-center";
import { memberRoleSummary } from "@/lib/team-center";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  leaveTeam,
  listPendingInvites,
  listTeamGroups,
  listTeamGuests,
  listTeamMembers,
  memberContentSummary,
  removeMember,
  setMemberRole,
  type TeamActionError,
  type TeamGroup,
  type TeamGuest,
  type TeamMember,
  type TeamPendingInvite,
} from "@/lib/supabase/teams";
import { teamRank, teamRoleCan, type TeamCapability, type TeamRole } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { InviteCard, InviteDialog } from "./team-invites";
import type { TeamCtx } from "./team-page";
import { PersonRow, formatShortDate, roleLabelKey } from "./team-ui";

type MembersView = "members" | "guests" | "invites" | "groups";

const MATRIX: { key: TranslationKey; cap: TeamCapability }[] = [
  { key: "tm.matrix.manageMembers", cap: "manage_members" },
  { key: "tm.matrix.createSpaces", cap: "create_spaces" },
  { key: "tm.matrix.variables", cap: "write_variables" },
  { key: "tm.matrix.publish", cap: "publish_external" },
  { key: "tm.matrix.audit", cap: "view_audit" },
];
const MATRIX_ROLES: { role: TeamRole; key: TranslationKey }[] = [
  { role: "owner", key: "tm.role.short.owner" },
  { role: "admin", key: "tm.role.short.admin" },
  { role: "editor", key: "tm.role.short.editor" },
  { role: "member", key: "tm.role.short.member" },
  { role: "guest", key: "tm.role.short.guest" },
];

/** "Roller ve yetkiler" (mockup 4): yetki role değil yeteneğe bağlıdır; tablo `teamRoleCan` ile aynı kuraldan çizilir. */
function RolesMatrix({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const policy = ctx.policy
    ? { publish_external_role: ctx.policy.publishExternalRole, guest_invite_role: ctx.policy.guestInviteRole, export_role: ctx.policy.exportRole }
    : undefined;
  return (
    <div data-roles-matrix>
      <p className="mb-3 text-small text-text-secondary">{t("tm.matrix.hint")}</p>
      <table className="w-full text-small">
        <thead>
          <tr className="text-caption font-bold text-text-muted">
            <th className="pb-2 text-left font-bold" />
            {MATRIX_ROLES.map((r) => (
              <th key={r.role} className="w-10 pb-2 text-center font-bold">
                {t(r.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX.map((row) => (
            <tr key={row.cap} className="border-t border-border-soft">
              <td className="py-2 pr-2 text-text">{t(row.key)}</td>
              {MATRIX_ROLES.map((r) => {
                const allowed = teamRoleCan(r.role, row.cap, policy);
                return (
                  <td key={r.role} className="py-2 text-center">
                    {allowed ? <Check size={15} className="mx-auto text-success" aria-label="✓" /> : <span className="text-text-muted" aria-label="–">–</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-caption text-text-muted">{t("tm.matrix.guestNote")}</p>
    </div>
  );
}

const ROLE_CHIP_TONE: Record<TeamRole, string> = {
  owner: "bg-primary-soft text-primary",
  admin: "bg-primary-soft text-primary",
  editor: "bg-success/10 text-success",
  member: "bg-surface-soft text-text-secondary",
  guest: "bg-warning/10 text-warning",
};

/**
 * Üyeler sekmesi (mockup 4 / P5): üstte Üyeler · Konuklar · Bekleyen davetler · Gruplar sayaç çipleri, tablo (Üye · Rol · Grup · Durum) ve sağda
 * "Roller ve yetkiler" matrisi + Gruplar özeti. Rol değiştirme, çıkarma (içerik devri seçenekli), ekipten ayrılma ve davet korunur.
 */
export function TeamMembersSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, can } = ctx;
  const { node: toastNode, show } = useToast();
  const [view, setView] = useState<MembersView>("members");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [pending, setPending] = useState<TeamPendingInvite[]>([]);
  const [guests, setGuests] = useState<TeamGuest[]>([]);
  const canManage = can("manage_members");
  const [projectRoles, setProjectRoles] = useState<Map<string, MemberProjectRoles>>(new Map());
  useEffect(() => {
    void fetchMemberProjectRoles(team.id).then(
      (list) => setProjectRoles(new Map(list.map((entry) => [entry.userId, entry]))),
      () => setProjectRoles(new Map()),
    );
  }, [team.id, version]);

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);
  useEffect(() => {
    void listTeamGroups(team.id).then(setGroups, () => setGroups([]));
    if (canManage) {
      void listPendingInvites(team.id).then(setPending, () => setPending([]));
      void listTeamGuests(team.id).then(setGuests, () => setGuests([]));
    }
  }, [team.id, canManage, version]);

  const list = usePagedList<TeamMember>(`team-members|${team.id}|${query}|${version}`, view === "members", (offset) => listTeamMembers(team.id, query, null, offset), (m) => m.userId);
  const refresh = () => setVersion((v) => v + 1);
  const changeRole = async (member: TeamMember, role: TeamRole) => {
    try {
      await setMemberRole(team.id, member.userId, role);
      show(t("tm.members.roleChanged"));
      refresh();
    } catch (error) {
      show((error as TeamActionError).message);
    }
  };
  const myRank = teamRank(team.myRole);

  const views: { key: MembersView; label: string; count: number | null; show: boolean }[] = [
    { key: "members", label: t("tm.members.viewMembers"), count: team.memberCount, show: true },
    { key: "guests", label: t("tm.members.viewGuests"), count: canManage ? guests.length : team.guestCount, show: team.guestCount > 0 || canManage },
    { key: "invites", label: t("tm.members.viewInvites"), count: pending.length, show: canManage },
    { key: "groups", label: t("tm.members.viewGroups"), count: groups.length, show: true },
  ];

  return (
    <section className="space-y-4" data-testid="team-members">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setSearchOpen((o) => !o)} aria-label={t("tm.members.search")} aria-pressed={searchOpen} data-members-search className="ml-auto grid h-11 w-11 place-items-center rounded-full bg-surface-soft text-text-secondary md:ml-0 md:order-last">
          <Search size={18} aria-hidden />
        </button>
      </div>
      {searchOpen && <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("tm.members.search")} aria-label={t("tm.members.search")} autoFocus className="h-11 w-full rounded-full border border-border bg-surface px-4 text-small" />}
      <div className="-mt-1 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible" role="tablist" aria-label={t("tm.members.filter")}>
        {views
          .filter((v) => v.show)
          .map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              data-members-view={v.key}
              className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-small transition-colors", view === v.key ? "border-primary bg-primary-soft font-bold text-primary" : "border-border-soft bg-surface text-text-secondary hover:bg-surface-soft")}
            >
              {v.label}
              {v.count !== null && <span className="tabular-nums">{v.count}</span>}
            </button>
          ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          {view === "members" && (
            <PagedListState list={list}>
              <ul className="grid gap-0 max-md:overflow-hidden max-md:rounded-2xl max-md:border max-md:border-border-soft max-md:bg-surface md:grid-cols-3 md:gap-3.5" data-testid="team-members-list">
                {list.items.map((member) => {
                  const manageable = canManage && member.role !== "owner" && teamRank(member.role) < myRank;
                  const name = member.displayName || member.username;
                  const summary = memberRoleSummary(projectRoles.get(member.userId));
                  return (
                    <li
                      key={member.userId}
                      data-member={member.username}
                      className="flex items-center gap-3 border-b border-border-soft px-3.5 py-2.5 last:border-b-0 md:flex-col md:gap-1 md:rounded-[20px] md:border md:bg-surface md:px-4 md:py-[18px] md:text-center md:last:border-b"
                    >
                      <PresenceAvatar userId={member.userId} src={member.avatarUrl} alt={name} size={44} />
                      <span className="min-w-0 flex-1 md:w-full md:flex-none">
                        <span className="block truncate text-body font-bold text-text">{name}</span>
                        <span className="block truncate text-caption text-text-muted">
                          @{member.username}{" "}
                          <PresenceStatusText userId={member.userId} className="before:mr-1 before:content-['·']" />
                        </span>
                      </span>
                      <span className="md:my-1">
                        {manageable ? (
                          <select
                            aria-label={t("tm.members.changeRole")}
                            value={member.role}
                            onChange={(event) => void changeRole(member, event.target.value as TeamRole)}
                            className={cn("h-8 appearance-none rounded-full border-0 px-3 text-caption font-bold", ROLE_CHIP_TONE[member.role])}
                          >
                            {(["admin", "editor", "member", "guest"] as TeamRole[])
                              .filter((role) => teamRank(role) < myRank)
                              .map((role) => (
                                <option key={role} value={role} disabled={role === "guest" && member.role !== "guest"}>
                                  {t(roleLabelKey(role))}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <span className={cn("inline-flex h-8 items-center rounded-full px-3 text-caption font-bold max-lg:text-[16px]", ROLE_CHIP_TONE[member.role])}>{t(roleLabelKey(member.role))}</span>
                        )}
                      </span>
                      <span className="hidden w-full border-t border-border-soft pt-2 text-caption text-text-secondary md:block" data-member-projects>
                        {summary.length > 0 ? summary.map((entry) => t(`tc.members.in.${entry.role}` as "tc.members.in.lead", { count: entry.count })).join(" · ") : member.groupNames?.join(", ") || t("tc.members.noProject")}
                      </span>
                      {manageable && (
                        <button type="button" onClick={() => setRemoving(member)} data-member-remove className="hidden h-8 items-center rounded-full border border-border px-3 text-caption font-semibold text-text-secondary hover:border-danger/40 hover:bg-danger/10 hover:text-danger md:inline-flex">
                          {t("tm.members.remove")}
                        </button>
                      )}
                      {manageable && (
                        <button type="button" onClick={() => setRemoving(member)} data-member-remove-phone aria-label={t("tm.members.remove")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-danger/10 hover:text-danger md:hidden">
                          <UserMinus size={20} aria-hidden />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </PagedListState>
          )}
          {view === "guests" && (
            <ul className="divide-y divide-border-soft rounded-2xl border border-border-soft bg-surface px-4" data-members-guests>
              {guests.length === 0 && <li className="py-5 text-small text-text-muted">{t("tm.guests.empty")}</li>}
              {guests.map((g) => (
                <li key={g.userId}>
                  <PersonRow name={g.displayName || g.username} username={g.username} avatarUrl={g.avatarUrl} sub={[g.guestOrg, g.guestUntil ? t("tm.members.guestUntil", { date: formatShortDate(g.guestUntil, "tr") }) : null].filter(Boolean).join(" · ")} />
                </li>
              ))}
            </ul>
          )}
          {view === "invites" && (
            <ul className="divide-y divide-border-soft rounded-2xl border border-border-soft bg-surface px-4" data-members-invites>
              {pending.length === 0 && <li className="py-5 text-small text-text-muted">{t("tm.admin.invites.none")}</li>}
              {pending.map((p) => (
                <li key={p.id}>
                  <PersonRow name={p.inviteeName || p.inviteeUsername} username={p.inviteeUsername} avatarUrl={p.inviteeAvatarUrl} sub={`@${p.inviteeUsername} · ${t(roleLabelKey(p.role))}`} />
                </li>
              ))}
            </ul>
          )}
          {view === "groups" && (
            <ul className="divide-y divide-border-soft rounded-2xl border border-border-soft bg-surface px-4" data-members-groups>
              {groups.length === 0 && <li className="py-5 text-small text-text-muted">{t("tm.groups.empty")}</li>}
              {groups.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-3 text-small">
                  <span className="font-bold text-text">{g.name}</span>
                  <span className="text-text-muted">{t("tm.members.groupCount", { count: g.memberCount })}</span>
                </li>
              ))}
            </ul>
          )}

          {team.myRole !== "owner" && (
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setLeaveOpen(true)} data-team-leave>
                {t("tm.members.leave")}
              </Button>
            </div>
          )}
          <button type="button" onClick={() => setMatrixOpen(true)} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-3.5 text-left lg:hidden" data-roles-open>
            <span className="min-w-0 flex-1">
              <span className="block text-small font-bold text-text">{t("tm.matrix.title")}</span>
              <span className="block text-caption text-text-secondary">{t("tm.matrix.subtitle")}</span>
            </span>
            <ChevronRight size={18} className="text-text-muted" aria-hidden />
          </button>
        </div>

        <aside className="space-y-4 max-lg:hidden" data-testid="team-members-aside">
          {canManage && <InviteCard ctx={ctx} onDone={refresh} />}
          {canManage && pending.length > 0 && (
            <section className="rounded-2xl border border-border-soft bg-surface p-4" data-testid="team-members-pending">
              <h3 className="mb-1 font-display text-body font-bold text-text">{t("tc.members.pending", { count: pending.length })}</h3>
              <ul>
                {pending.map((invite) => (
                  <li key={invite.id} className="border-t border-border-soft py-2 text-small first:border-t-0">
                    <b className="text-text">@{invite.inviteeUsername}</b> · {t(roleLabelKey(invite.role))}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <button type="button" onClick={() => setMatrixOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-3.5 text-left" data-roles-open-aside>
            <span className="min-w-0 flex-1">
              <span className="block text-small font-bold text-text">{t("tm.matrix.title")}</span>
              <span className="block text-caption text-text-secondary">{t("tm.matrix.subtitle")}</span>
            </span>
            <ChevronRight size={18} className="text-text-muted" aria-hidden />
          </button>
          {groups.length > 0 && (
            <section className="rounded-2xl border border-border-soft bg-surface p-4" data-members-groups-card>
              <h2 className="mb-3 font-display text-body font-bold">{t("tm.members.viewGroups")}</h2>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <span key={g.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-soft px-3 text-caption font-bold text-text">
                    {g.name}
                    <span className="font-medium text-text-muted">{g.memberCount}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      {toastNode}
      {matrixOpen && (
        <SpaceDialog title={t("tm.matrix.title")} onClose={() => setMatrixOpen(false)}>
          <RolesMatrix ctx={ctx} />
        </SpaceDialog>
      )}
      {inviteOpen && <InviteDialog ctx={ctx} onClose={() => setInviteOpen(false)} onDone={() => undefined} />}
      {removing && (
        <RemoveMemberDialog
          ctx={ctx}
          member={removing}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            show(t("tm.members.removed"));
            refresh();
            ctx.reload();
          }}
        />
      )}
      {leaveOpen && <LeaveDialog ctx={ctx} onClose={() => setLeaveOpen(false)} />}
    </section>
  );
}

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toLocaleUpperCase() || "?";

/** Çıkarma: önce üyenin ekipteki içeriğinin özeti, sonra içeriğin kime kalacağı ("ekipte kal" / "bir üyeye devret" / "kişisel kopya"). */
function RemoveMemberDialog({ ctx, member, onClose, onDone }: { ctx: TeamCtx; member: TeamMember; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [mode, setMode] = useState<"team" | "member" | "personal">(ctx.policy?.offboardDefault === "admin" ? "member" : "team");
  const [owner, setOwner] = useState("");
  const [candidates, setCandidates] = useState<TeamMember[]>([]);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void memberContentSummary(ctx.team.id, member.userId).then(setSummary, () => setSummary({}));
    void listTeamMembers(ctx.team.id, "", null, 0).then((page) => setCandidates(page.items.filter((m) => m.userId !== member.userId && m.role !== "guest")), () => undefined);
  }, [ctx.team.id, member.userId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "member" && !owner) {
      setError(t("tm.members.pickOwner"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await removeMember(ctx.team.id, member.userId, mode, mode === "member" ? owner : null, notify);
      onDone();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  const name = member.displayName || member.username;
  const first = name.split(" ")[0] || name;
  const total = (summary?.prompts ?? 0) + (summary?.items ?? 0) + (summary?.variables ?? 0);
  const modes: { key: "team" | "member" | "personal"; title: TranslationKey; hint: string; badge?: boolean }[] = [
    { key: "team", title: "tm.members.fate.team", hint: t("tm.members.fate.teamHint", { name: first }), badge: true },
    { key: "member", title: "tm.members.fate.member", hint: t("tm.members.fate.memberHint") },
    { key: "personal", title: "tm.members.fate.personal", hint: t("tm.members.fate.personalHint", { name: first }) },
  ];
  const stats: [number, TranslationKey][] = [
    [summary?.prompts ?? 0, "tm.members.stat.prompts"],
    [summary?.items ?? 0, "tm.members.stat.items"],
    [summary?.variables ?? 0, "tm.members.stat.variables"],
  ];
  return (
    <SpaceDialog
      eyebrow={t("tm.members.removeEyebrow")}
      leading={
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary/10 text-body font-bold text-secondary" aria-hidden>
          {initialsOf(name)}
        </span>
      }
      title={t("tm.members.removeTitle", { name })}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-remove-form"
      wide
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="max-sm:flex-1">
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !summary} className="max-sm:flex-1">
            {t("tm.members.removeConfirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-small text-text-secondary">{summary ? t("tm.members.contentOf", { name: first }) : t("common.loading")}</p>
          <div className="grid grid-cols-3 gap-2" data-remove-stats>
            {stats.map(([value, label]) => (
              <div key={label} className="rounded-lg bg-surface-soft px-3 py-2.5">
                <p className="text-h3 font-bold leading-tight text-text">{value}</p>
                <p className="text-caption text-text-secondary">{t(label)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2" role="radiogroup" aria-label={t("tm.members.contentFate")}>
          <p className="text-small font-bold text-text">{t("tm.members.contentFate")}</p>
          {modes.map((m) => {
            const on = mode === m.key;
            return (
              <div key={m.key} className={cn("flex items-center gap-3 rounded-lg border px-3.5 py-2.5", on ? "border-2 border-primary bg-primary-soft/40" : "border-border-soft")}>
                <button type="button" role="radio" aria-checked={on} data-remove-mode={m.key} onClick={() => setMode(m.key)} className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-primary" : "border-border-strong")} aria-hidden>
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-small font-bold text-text">
                      {t(m.title)}
                      {m.badge && <span className="rounded-full bg-success/10 px-2 py-0.5 text-caption font-bold text-success">{t("tm.members.recommended")}</span>}
                    </span>
                    <span className="block text-caption text-text-secondary">{m.hint}</span>
                  </span>
                </button>
                {m.key === "member" && (
                  <select
                    value={owner}
                    onChange={(event) => {
                      setOwner(event.target.value);
                      setMode("member");
                    }}
                    aria-label={t("tm.members.pickOwner")}
                    data-remove-owner
                    className="h-9 max-w-[9.5rem] shrink-0 rounded-full border border-border bg-background px-3 text-caption font-bold text-text"
                  >
                    <option value="">{t("tm.members.pickShort")}</option>
                    {candidates.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.displayName || c.username}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
        <p className="rounded-lg bg-primary-soft px-3.5 py-2.5 text-caption text-primary">{t("tm.members.alwaysStays")}</p>
        <label className="flex items-center gap-2.5 text-small text-text">
          <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="h-5 w-5 accent-primary" />
          {t("tm.members.notifyName", { name })}
        </label>
        {total === 0 && summary && <p className="text-caption text-text-muted">{t("tm.members.nothingToMove")}</p>}
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}

export function LeaveDialog({ ctx, onClose }: { ctx: TeamCtx; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmDialog
      id="team-leave"
      title={t("tm.members.leaveTitle", { name: ctx.team.name })}
      body={t("tm.members.leaveBody")}
      confirmLabel={t("tm.members.leave")}
      danger
      busy={busy}
      error={error}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        try {
          await leaveTeam(ctx.team.id);
          router.push("/teams");
        } catch (e) {
          setError((e as TeamActionError).message);
          setBusy(false);
        }
      }}
    />
  );
}
