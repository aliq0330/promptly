"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "@/components/icons/search";
import { Button } from "@/components/ui/button";
import { fieldLabelClassName } from "@/components/ui/field";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  leaveTeam,
  listTeamMembers,
  memberContentSummary,
  removeMember,
  setMemberRole,
  type TeamActionError,
  type TeamMember,
} from "@/lib/supabase/teams";
import { teamRank, type TeamRole } from "@/lib/teams";
import { formatRelativeTime } from "@/lib/utils";
import { InviteDialog } from "./team-invites";
import type { TeamCtx } from "./team-page";
import { PersonRow, PillChoice, RoleChip, formatShortDate, roleLabelKey } from "./team-ui";

type RoleFilter = "all" | TeamRole;
const FILTERS: readonly RoleFilter[] = ["all", "owner", "admin", "editor", "member", "guest"];

/** Üyeler sekmesi: arama + rol süzgeci, rol değiştirme, çıkarma (içerik devri seçenekli), ekipten ayrılma ve davet. */
export function TeamMembersSection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { team, can } = ctx;
  const { node: toastNode, show } = useToast();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [version, setVersion] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const list = usePagedList<TeamMember>(`team-members|${team.id}|${query}|${filter}|${version}`, true, (offset) => listTeamMembers(team.id, query, filter === "all" ? null : filter, offset), (m) => m.userId);
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

  const canManage = can("manage_members");
  const myRank = teamRank(team.myRole);

  return (
    <section className="space-y-4" data-testid="team-members">
      <div className="flex flex-wrap items-center gap-3">
        <PillChoice<RoleFilter>
          ariaLabel={t("tm.members.filter")}
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((key) => ({ key, label: key === "all" ? t("tm.members.all") : t(roleLabelKey(key)) }))}
        />
        <label className="relative ml-auto block w-full sm:w-60">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("tm.members.search")} aria-label={t("tm.members.search")} className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-3 text-small" />
        </label>
        {canManage && (
          <Button type="button" onClick={() => setInviteOpen(true)} data-team-invite>
            {t("tm.invite.title")}
          </Button>
        )}
      </div>

      <PagedListState list={list}>
        <ul className="divide-y divide-border-soft rounded-lg border border-border-soft bg-surface px-4" data-testid="team-members-list">
          {list.items.map((member) => {
            const manageable = canManage && member.role !== "owner" && teamRank(member.role) < myRank;
            return (
              <li key={member.userId} data-member={member.username}>
                <PersonRow
                  name={member.displayName || member.username}
                  username={member.username}
                  avatarUrl={member.avatarUrl}
                  sub={
                    <>
                      @{member.username}
                      {member.groupNames && member.groupNames.length > 0 && ` · ${member.groupNames.join(", ")}`}
                      {member.role === "guest" && member.guestUntil && ` · ${t("tm.members.guestUntil", { date: formatShortDate(member.guestUntil, language) })}`}
                      {member.role !== "guest" && ` · ${t("tm.members.joined", { time: formatRelativeTime(member.joinedAt, language) })}`}
                    </>
                  }
                  right={
                    manageable ? (
                      <>
                        <select
                          aria-label={t("tm.members.changeRole")}
                          value={member.role}
                          onChange={(event) => void changeRole(member, event.target.value as TeamRole)}
                          className="h-8 rounded-lg border border-border bg-background px-2 text-caption"
                        >
                          {(["admin", "editor", "member", "guest"] as TeamRole[])
                            .filter((role) => teamRank(role) < myRank)
                            .map((role) => (
                              <option key={role} value={role} disabled={role === "guest" && member.role !== "guest"}>
                                {t(roleLabelKey(role))}
                              </option>
                            ))}
                        </select>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(member)} data-member-remove>
                          {t("tm.members.remove")}
                        </Button>
                      </>
                    ) : (
                      <RoleChip role={member.role} />
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      </PagedListState>

      {team.myRole !== "owner" && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => setLeaveOpen(true)} data-team-leave>
            {t("tm.members.leave")}
          </Button>
        </div>
      )}

      {toastNode}
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

  const total = (summary?.prompts ?? 0) + (summary?.items ?? 0) + (summary?.variables ?? 0);
  return (
    <SpaceDialog
      title={t("tm.members.removeTitle", { name: member.displayName || member.username })}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-remove-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !summary}>
            {t("tm.members.removeConfirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-small text-text-secondary">
          {summary ? t("tm.members.summary", { prompts: summary.prompts ?? 0, items: summary.items ?? 0, variables: summary.variables ?? 0 }) : t("common.loading")}
        </p>
        {total > 0 && (
          <div>
            <span className={fieldLabelClassName}>{t("tm.members.contentFate")}</span>
            <PillChoice<"team" | "member" | "personal">
              ariaLabel={t("tm.members.contentFate")}
              value={mode}
              onChange={setMode}
              options={[
                { key: "team", label: t("tm.members.fate.team"), hint: t("tm.members.fate.teamHint") },
                { key: "member", label: t("tm.members.fate.member"), hint: t("tm.members.fate.memberHint") },
                { key: "personal", label: t("tm.members.fate.personal"), hint: t("tm.members.fate.personalHint") },
              ]}
            />
            <p className="mt-1.5 text-caption text-text-muted">{t(`tm.members.fate.${mode}Hint` as "tm.members.fate.teamHint")}</p>
          </div>
        )}
        {mode === "member" && total > 0 && (
          <select value={owner} onChange={(event) => setOwner(event.target.value)} aria-label={t("tm.members.pickOwner")} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-small">
            <option value="">{t("tm.members.pickOwner")}</option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.displayName || c.username}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-small">
          <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
          {t("tm.members.notify")}
        </label>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}

function LeaveDialog({ ctx, onClose }: { ctx: TeamCtx; onClose: () => void }) {
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
