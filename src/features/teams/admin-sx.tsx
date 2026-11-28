"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { OptionGroup } from "@/components/ui/option-group";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { SxAvatar, SxBarAction, SxBtn, SxCard, SxConfirmPage, SxCover, SxField, SxFoot, SxGap, SxLabel, SxNote, SxPage, SxPicker, SxRow, SxRowCol, SxSep, SxSub, SxSwitch, SxTag, SxVal } from "@/features/settings/sx";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  cancelInvitation,
  createInviteLink,
  deleteTeam,
  extendGuest,
  fetchAuditStats,
  inviteUser,
  listAudit,
  listInviteLinks,
  listPendingInvites,
  listTeamGuests,
  listTeamMembers,
  revokeInviteLink,
  transferOwnership,
  updateTeam,
  type TeamAuditEntry,
  type TeamGuest,
  type TeamInviteLink,
  type TeamMember,
  type TeamPendingInvite,
  type TeamPolicy,
} from "@/lib/supabase/teams";
import { teamLink, type TeamRole } from "@/lib/teams";
import { formatRelativeTime } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { TeamCtx } from "./team-page";
import { auditSentence } from "./team-admin-section";
import { LoadMoreButton } from "@/features/feed/load-more";
import { TEAM_TONES, resolveTeamTone, roleLabelKey } from "./team-ui";

/** Ekip yönetimi — mobil mockup sayfaları (docs/mockups/ayar-sayfalari: C1–C6, D2, D3, E3). */

const TONE_COLOR: Record<string, string> = { primary: "var(--color-primary)", sky: "var(--color-secondary)", plum: "var(--color-text-muted)" };
const TONE_LABEL: Record<string, TranslationKey> = { primary: "ay.team.toneBlue", sky: "ay.team.toneSky", plum: "ay.team.toneNeutral" };
export const teamColor = (tone: string | null | undefined) => TONE_COLOR[resolveTeamTone(tone)] ?? TONE_COLOR.primary;

export type TeamAdminRoute = { section: string | null; sub: string | null; key: string | null };

export function TeamAdminPhone({ ctx, route, go }: { ctx: TeamCtx; route: TeamAdminRoute; go: (section: string | null, sub?: string | null, key?: string | null) => void }) {
  switch (route.section) {
    case "profile":
      return <ProfilePage ctx={ctx} />;
    case "policies":
      return <PoliciesPage ctx={ctx} sub={route.sub} pickKey={route.key} go={go} />;
    case "invites":
      return <InvitesPage ctx={ctx} sub={route.sub} go={go} />;
    case "guests":
      return <GuestsPage ctx={ctx} />;
    case "audit":
      return <AuditPage ctx={ctx} />;
    case "danger":
      return <DangerPage ctx={ctx} sub={route.sub} go={go} />;
    default:
      return <ManageList ctx={ctx} />;
  }
}

const back = (ctx: TeamCtx) => teamLink(ctx.team.id, "admin");

// ---------------------------------------------------------------------------------------------
// C1 · Ekip yönetimi (liste)
// ---------------------------------------------------------------------------------------------

function ManageList({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, can } = ctx;
  const [pending, setPending] = useState<number | null>(null);
  const [guests, setGuests] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    if (can("manage_members")) {
      void listPendingInvites(team.id).then((l) => alive && setPending(l.length), () => undefined);
      void listTeamGuests(team.id).then((l) => alive && setGuests(l.filter((g) => !g.expired).length), () => undefined);
    }
    return () => {
      alive = false;
    };
  }, [team.id, can]);
  const href = (section: string) => teamLink(team.id, "admin", { section });
  const showTeam = can("manage_team");
  const showPeople = can("manage_members") || can("manage_groups");
  const showRecords = can("view_audit") || can("export");
  return (
    <SxPage parent={team.name} title={t("ay.manage.title")} backHref={teamLink(team.id)} testId="team-manage-list">
      <div className="hd">
        <SxCover name={team.name} color={teamColor(team.tone)} />
        <div className="rt">
          <div className="t">{team.name}</div>
          <div className="s" style={{ marginTop: 4 }}>
            <SxTag tone="or">{t(roleLabelKey(team.myRole))}</SxTag> <SxTag>{t("ay.team.members", { count: team.memberCount })}</SxTag> <SxTag>{t("ay.team.projects", { count: team.spaceCount })}</SxTag>
          </div>
        </div>
      </div>
      {showTeam && (
        <>
          <SxLabel>{t("ay.team.team")}</SxLabel>
          <SxCard>
            <SxRow href={href("profile")} title={t("ay.team.profile")} desc={t("ay.team.profileDesc")} />
            <SxRow href={href("policies")} title={t("ay.team.policies")} desc={t("ay.team.policiesDesc")} />
          </SxCard>
        </>
      )}
      {showPeople && (
        <>
          <SxLabel>{t("ay.manage.people")}</SxLabel>
          <SxCard>
            {can("manage_members") && <SxRow href={href("invites")} title={t("ay.team.invites")} desc={t("ay.team.invitesDesc")} trailing={pending ? <SxTag tone="or">{pending}</SxTag> : undefined} />}
            {can("manage_groups") && <SxRow href={href("groups")} title={t("ay.team.groups")} desc={t("ay.team.groupsDesc")} />}
            {can("manage_members") && <SxRow href={href("guests")} title={t("ay.team.guests")} desc={t("ay.team.guestsDesc")} trailing={guests ? <SxTag>{t("ay.team.guestsActive", { count: guests })}</SxTag> : undefined} />}
          </SxCard>
        </>
      )}
      {showRecords && (
        <>
          <SxLabel>{t("ay.team.records")}</SxLabel>
          <SxCard>
            {can("view_audit") && <SxRow href={href("audit")} title={t("ay.team.audit")} desc={t("ay.team.auditDesc")} />}
            {can("export") && <SxRow href={href("export")} title={t("ay.team.export")} desc={t("ay.team.exportDesc")} />}
          </SxCard>
        </>
      )}
      {team.myRole === "owner" && (
        <>
          <SxLabel>{t("ay.danger.label")}</SxLabel>
          <SxCard>
            <SxRow href={href("danger")} title={t("ay.team.dangerRow")} titleClass="dgt" desc={t("ay.team.dangerDesc")} />
          </SxCard>
        </>
      )}
    </SxPage>
  );
}

// ---------------------------------------------------------------------------------------------
// C2 · Ekip profili
// ---------------------------------------------------------------------------------------------

function ProfilePage({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team } = ctx;
  const router = useRouter();
  const save = useAsyncAction();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [tone, setTone] = useState<string>(resolveTeamTone(team.tone));
  const changes = (name.trim() !== team.name ? 1 : 0) + (description.trim() !== (team.description ?? "") ? 1 : 0) + (tone !== resolveTeamTone(team.tone) ? 1 : 0);
  const valid = name.trim().length >= 2 && name.trim().length <= 60;
  async function submit() {
    if (!valid || changes === 0) return;
    const ok = await save.run(async () => {
      await updateTeam(team.id, { name: name.trim(), description: description.trim(), tone });
      return true;
    });
    if (!ok) return;
    ctx.reload();
    router.replace(back(ctx));
  }
  return (
    <SxPage
      parent={t("ay.manage.title")}
      title={t("ay.team.profile")}
      backHref={back(ctx)}
      testId="team-profile-page"
      action={<SxBarAction off={changes === 0 || !valid} disabled={changes === 0 || !valid || save.busy} onClick={() => void submit()}>{t("common.save")}</SxBarAction>}
      footer={
        <SxFoot meta={changes ? t("ay.changes", { count: changes }) : undefined}>
          <SxBtn tone={changes && valid ? "pri" : "off"} full style={{ width: "auto", flex: 1 }} disabled={changes === 0 || !valid || save.busy} onClick={() => void submit()}>
            {save.busy ? t("common.saving") : t("common.save")}
          </SxBtn>
        </SxFoot>
      }
    >
      <SxLabel>{t("ay.basics")}</SxLabel>
      <SxCard>
        <SxField id="ek-ad" label={t("tm.create.name")} note={t("rooms.form.required")} inputProps={{ value: name, maxLength: 60, onChange: (e) => setName(e.target.value) }} hint={t("ay.team.nameHint")} error={!valid} />
        <SxField id="ek-ac" label={t("ay.team.description")} note={t("rooms.form.optional")} multiline textareaProps={{ value: description, maxLength: 500, onChange: (e) => setDescription(e.target.value) }} hint={`${[...description.trim()].length} / 500`} />
      </SxCard>
      <SxLabel>{t("tm.create.tone")}</SxLabel>
      <OptionGroup<string>
        variant="sx-tail"
        ariaLabel={t("tm.create.tone")}
        value={tone}
        onChange={setTone}
        options={TEAM_TONES.map((k) => ({ key: k, label: t(TONE_LABEL[k]), leading: <span className="cov" style={{ background: TONE_COLOR[k], width: 36, height: 36, borderRadius: 10 }} /> }))}
      />
      <SxLabel>{t("ay.team.preview")}</SxLabel>
      <SxCard style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ height: 64, background: TONE_COLOR[tone] }} />
        <div className="row" style={{ padding: "14px 16px" }}>
          <SxCover name={name || "?"} color={TONE_COLOR[tone]} />
          <div className="rt">
            <div className="t">{name}</div>
            <div className="s">{t("ay.team.previewMeta", { members: team.memberCount, projects: team.spaceCount })}</div>
          </div>
        </div>
      </SxCard>
      {save.error && (
        <>
          <SxGap h={12} />
          <SxNote><span className="dgt">{save.error}</span></SxNote>
        </>
      )}
    </SxPage>
  );
}

// ---------------------------------------------------------------------------------------------
// C3 · Politikalar · C4 · Seçici sayfa
// ---------------------------------------------------------------------------------------------

type PolicyKey = keyof TeamPolicy;
const POLICY_SNAKE: Record<PolicyKey, string> = {
  contentOwner: "content_owner",
  offboardDefault: "offboard_default",
  defaultMemberRole: "default_member_role",
  inviteLinkTtlDays: "invite_link_ttl_days",
  publishExternalRole: "publish_external_role",
  guestInviteRole: "guest_invite_role",
  exportRole: "export_role",
};
const ROLE_DESC: Record<string, TranslationKey> = { owner: "ay.pol.roleOwner", admin: "ay.pol.roleAdmin", editor: "ay.pol.roleEditor", member: "ay.pol.roleMember" };

function PoliciesPage({ ctx, sub, pickKey, go }: { ctx: TeamCtx; sub: string | null; pickKey: string | null; go: (section: string | null, sub?: string | null, key?: string | null) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const save = useAsyncAction();
  const policy = ctx.policy;
  const [draft, setDraft] = useState<Partial<TeamPolicy>>({});
  if (!policy) return null;
  const value = <K extends PolicyKey>(key: K): TeamPolicy[K] => (key in draft ? (draft[key] as TeamPolicy[K]) : policy[key]);
  const changes = Object.keys(draft).length;
  const edit = <K extends PolicyKey>(key: K, next: TeamPolicy[K]) =>
    setDraft((prev) => {
      const out = { ...prev, [key]: next };
      if (policy[key] === next) delete out[key];
      return out;
    });
  const roleLabel = (role: string) => t(roleLabelKey(role as TeamRole));
  const labels: Record<PolicyKey, { title: string; desc: string; show: string; options: { key: string; label: string; desc?: string }[]; intro: string; pickLabel: string; note: string }> = {
    publishExternalRole: { title: t("ay.pol.publishExternal"), desc: t("ay.pol.publishExternalDesc"), show: roleLabel(value("publishExternalRole")), options: (["owner", "admin", "editor"] as const).map((k) => ({ key: k, label: roleLabel(k), desc: t(ROLE_DESC[k]) })), intro: t("ay.pol.publishExternalIntro"), pickLabel: t("ay.pol.whoCan"), note: t("ay.pol.roleNote") },
    guestInviteRole: { title: t("ay.pol.guestInvite"), desc: t("ay.pol.guestInviteDesc"), show: roleLabel(value("guestInviteRole")), options: (["owner", "admin", "editor"] as const).map((k) => ({ key: k, label: roleLabel(k), desc: t(ROLE_DESC[k]) })), intro: t("ay.pol.guestInviteIntro"), pickLabel: t("ay.pol.whoCan"), note: t("ay.pol.roleNote") },
    exportRole: { title: t("ay.pol.export"), desc: t("ay.pol.exportDesc"), show: roleLabel(value("exportRole")), options: (["owner", "admin"] as const).map((k) => ({ key: k, label: roleLabel(k), desc: t(ROLE_DESC[k]) })), intro: t("ay.pol.exportIntro"), pickLabel: t("ay.pol.whoCan"), note: t("ay.pol.roleNote") },
    contentOwner: { title: t("ay.pol.contentOwner"), desc: t("ay.pol.contentOwnerDesc"), show: t(value("contentOwner") === "team" ? "tm.admin.policy.owner.team" : "tm.admin.policy.owner.author"), options: [{ key: "team", label: t("tm.admin.policy.owner.team") }, { key: "author", label: t("tm.admin.policy.owner.author") }], intro: t("ay.pol.contentOwnerDesc"), pickLabel: t("ay.pickLabel"), note: t("ay.pol.pickNote") },
    offboardDefault: { title: t("ay.pol.offboard"), desc: t("ay.pol.offboardDesc"), show: t(`ay.pol.offboard.${value("offboardDefault")}` as TranslationKey), options: (["ask", "team", "admin"] as const).map((k) => ({ key: k, label: t(`ay.pol.offboard.${k}` as TranslationKey) })), intro: t("ay.pol.offboardDesc"), pickLabel: t("ay.pickLabel"), note: t("ay.pol.pickNote") },
    defaultMemberRole: { title: t("ay.pol.defaultRole"), desc: t("ay.pol.defaultRoleDesc"), show: roleLabel(value("defaultMemberRole")), options: (["member", "editor"] as const).map((k) => ({ key: k, label: roleLabel(k) })), intro: t("ay.pol.defaultRoleDesc"), pickLabel: t("ay.pickLabel"), note: t("ay.pol.pickNote") },
    inviteLinkTtlDays: { title: t("ay.pol.linkTtl"), desc: t("ay.pol.linkTtlDesc"), show: t("tm.panel.days", { count: value("inviteLinkTtlDays") }), options: [1, 7, 14, 30].map((d) => ({ key: String(d), label: t("tm.panel.days", { count: d }) })), intro: t("ay.pol.linkTtlDesc"), pickLabel: t("ay.pickLabel"), note: t("ay.pol.pickNote") },
  };
  const row = (key: PolicyKey) => (
    <SxRow title={labels[key].title} desc={labels[key].desc} trailing={<SxBtn tone="sel" onClick={() => go("policies", "pick", key)}>{labels[key].show}</SxBtn>} />
  );
  async function submit() {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) patch[POLICY_SNAKE[k as PolicyKey]] = v;
    const ok = await save.run(async () => {
      await updateTeam(ctx.team.id, patch);
      return true;
    });
    if (!ok) return;
    setDraft({});
    ctx.reload();
    router.replace(back(ctx));
  }
  const picked = pickKey && pickKey in labels ? (pickKey as PolicyKey) : null;
  return (
    <>
      <SxPage
        parent={t("ay.manage.title")}
        title={t("ay.team.policies")}
        backHref={back(ctx)}
        testId="team-policies-page"
        action={<SxBarAction off={changes === 0} disabled={changes === 0 || save.busy} onClick={() => void submit()}>{t("common.save")}</SxBarAction>}
        footer={
          <SxFoot meta={changes ? t("ay.changes", { count: changes }) : undefined}>
            <SxBtn tone={changes ? "pri" : "off"} full style={{ width: "auto", flex: 1 }} disabled={changes === 0 || save.busy} onClick={() => void submit()}>
              {save.busy ? t("common.saving") : t("common.save")}
            </SxBtn>
          </SxFoot>
        }
      >
        <p className="s" style={{ margin: "8px 20px 0" }}>{t("ay.pol.intro")}</p>
        <SxLabel>{t("tm.admin.policy.sharing")}</SxLabel>
        <SxCard>{row("publishExternalRole")}{row("guestInviteRole")}{row("exportRole")}</SxCard>
        <SxLabel>{t("tm.admin.policy.ownership")}</SxLabel>
        <SxCard>{row("contentOwner")}{row("offboardDefault")}</SxCard>
        <SxLabel>{t("tm.admin.policy.joining")}</SxLabel>
        <SxCard>{row("defaultMemberRole")}{row("inviteLinkTtlDays")}</SxCard>
        {save.error && (
          <>
            <SxGap h={12} />
            <SxNote><span className="dgt">{save.error}</span></SxNote>
          </>
        )}
      </SxPage>
      {picked && sub === "pick" && (
        <SxPicker<string>
          open
          onClose={() => go("policies")}
          parent={t("ay.team.policies")}
          title={labels[picked].title}
          intro={labels[picked].intro}
          label={labels[picked].pickLabel}
          options={labels[picked].options}
          value={String(value(picked))}
          onPick={(key) => edit(picked, (picked === "inviteLinkTtlDays" ? Number(key) : key) as never)}
          note={labels[picked].note}
          pickLabel={t("ay.pick")}
          testId="team-policy-picker"
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// C5 · Davetler
// ---------------------------------------------------------------------------------------------

function InvitesPage({ ctx, sub, go }: { ctx: TeamCtx; sub: string | null; go: (section: string | null, sub?: string | null, key?: string | null) => void }) {
  const { t, language } = useTranslation();
  const { team } = ctx;
  const [pending, setPending] = useState<TeamPendingInvite[]>([]);
  const [links, setLinks] = useState<TeamInviteLink[]>([]);
  const [reload, setReload] = useState(0);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const invite = useAsyncAction();
  const row = useAsyncAction();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([listPendingInvites(team.id), listInviteLinks(team.id)]).then(
      ([p, l]) => {
        if (!alive) return;
        setPending(p);
        setLinks(l);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [team.id, reload]);
  const date = (iso: string) => new Date(iso).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "short" });
  async function send() {
    if (!username.trim()) return;
    const ok = await invite.run(async () => {
      await inviteUser(team.id, username, role, null, null);
      return true;
    });
    if (!ok) return;
    setToast(t("ay.invites.sent", { name: username.replace(/^@/, "") }));
    setUsername("");
    setReload((n) => n + 1);
  }
  async function act(task: () => Promise<void>) {
    const ok = await row.run(async () => {
      await task();
      return true;
    });
    if (ok) setReload((n) => n + 1);
  }
  return (
    <>
      <SxPage parent={t("ay.manage.title")} title={t("ay.team.invites")} backHref={back(ctx)} testId="team-invites-page">
        <SxLabel>{t("ay.invites.byUsername")}</SxLabel>
        <SxCard style={{ paddingTop: 14, paddingBottom: 16 }}>
          <label className="fl" htmlFor="ed-ad">{t("ay.invites.username")}</label>
          <input id="ed-ad" className="inp" placeholder="@kullanıcı" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          <div className="fl" style={{ marginTop: 14 }} id="ed-rol">{t("ay.team.role")}</div>
          <ChoiceGroup<TeamRole> variant="sx-seg" labelledBy="ed-rol" value={role} onChange={setRole} options={[{ key: "member", label: t("tm.role.member") }, { key: "editor", label: t("tm.role.editor") }, { key: "admin", label: t("tm.role.admin") }]} />
          <SxBtn tone="pri" full style={{ marginTop: 14, height: 46 }} disabled={invite.busy} onClick={() => void send()}>{t("ay.team.sendInvite")}</SxBtn>
          {(invite.error || toast) && <p className={invite.error ? "hint err" : "hint"}>{invite.error ?? toast}</p>}
        </SxCard>

        <SxLabel>{t("ay.team.pendingInvites")}</SxLabel>
        <SxCard>
          {pending.length === 0 && <SxRow title={t("ay.invites.none")} />}
          {pending.map((p) => (
            <SxRow key={p.id} lead={<SxAvatar name={p.inviteeName || p.inviteeUsername} src={p.inviteeAvatarUrl} />} title={`@${p.inviteeUsername}`} desc={`${t(roleLabelKey(p.role))} · ${formatRelativeTime(p.createdAt, language)}`} trailing={<SxBtn disabled={row.busy} onClick={() => void act(() => cancelInvitation(p.id))}>{t("ay.team.cancel")}</SxBtn>} />
          ))}
        </SxCard>

        <SxLabel>{t("ay.invites.links")}</SxLabel>
        <SxCard>
          {links.length === 0 && <SxRow title={t("ay.invites.noLinks")} />}
          {links.map((link, index) => (
            <Fragment key={link.id}>
              {index > 0 && <SxSep />}
              <SxRowCol title={`…/team-join#${link.id.slice(0, 6)}`}>
                {link.revokedAt ? (
                  <div className="s"><SxTag>{t("ay.team.revoked")}</SxTag></div>
                ) : (
                  <>
                    <div className="s">{(link.maxUses ? t("ay.invites.usesOf", { used: link.useCount, max: link.maxUses }) : t("ay.invites.uses", { used: link.useCount }))} · {t("ay.team.untilDate", { date: date(link.expiresAt) })} · {t("ay.invites.by", { name: link.createdByName })}</div>
                    <SxBtn tone="dng" disabled={row.busy} onClick={() => void act(() => revokeInviteLink(link.id))}>{t("ay.team.cancel")}</SxBtn>
                  </>
                )}
              </SxRowCol>
            </Fragment>
          ))}
        </SxCard>
        <SxGap h={14} />
        <div style={{ padding: "0 16px" }}>
          <SxBtn tone="out" full style={{ height: 46 }} onClick={() => go("invites", "newlink")}>{t("ay.invites.newLink")}</SxBtn>
        </div>
        <SxGap h={16} />
        <SxNote>{t("ay.team.inviteNoteA")} <b>{t("ay.team.inviteNoteB")}</b> {t("ay.team.inviteNoteC")}</SxNote>
      </SxPage>
      {sub === "newlink" && <TeamNewLink ctx={ctx} onClose={() => go("invites")} onCreated={() => setReload((n) => n + 1)} />}
    </>
  );
}

function TeamNewLink({ ctx, onClose, onCreated }: { ctx: TeamCtx; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const [role, setRole] = useState<TeamRole>("member");
  const [ttl, setTtl] = useState<string>(String(ctx.policy?.inviteLinkTtlDays ?? 7));
  const [uses, setUses] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  async function create() {
    const made = await action.run(() => createInviteLink(ctx.team.id, role, uses ? Number(uses) : null, Number(ttl)));
    if (!made) return;
    setFresh(`${window.location.origin}/promptly/team-join#${made.token}`);
    onCreated();
  }
  return (
    <SxSub
      open
      onClose={onClose}
      parent={t("ay.team.invites")}
      title={t("ay.invites.newLink")}
      testId="team-new-link"
      footer={
        fresh ? (
          <SxBtn tone="pri" full onClick={() => void navigator.clipboard?.writeText(fresh)}>{t("ay.invites.copy")}</SxBtn>
        ) : (
          <SxBtn tone="pri" full disabled={action.busy} onClick={() => void create()}>{action.busy ? t("common.loading") : t("ay.invites.create")}</SxBtn>
        )
      }
    >
      <SxLabel>{t("ay.team.role")}</SxLabel>
      <ChoiceGroup<TeamRole> variant="sx-chips" ariaLabel={t("ay.team.role")} value={role} onChange={setRole} options={[{ key: "member", label: t("tm.role.member") }, { key: "editor", label: t("tm.role.editor") }, { key: "admin", label: t("tm.role.admin") }]} />
      <SxLabel>{t("ay.pol.linkTtl")}</SxLabel>
      <ChoiceGroup<string> variant="sx-chips" ariaLabel={t("ay.pol.linkTtl")} value={ttl} onChange={setTtl} options={[1, 7, 14, 30].map((d) => ({ key: String(d), label: t("tm.panel.days", { count: d }) }))} />
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
// C6 · Konuklar
// ---------------------------------------------------------------------------------------------

function GuestsPage({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const [guests, setGuests] = useState<TeamGuest[] | null>(null);
  const [reload, setReload] = useState(0);
  const action = useAsyncAction();
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    void listTeamGuests(ctx.team.id).then((g) => alive && setGuests(g), () => alive && setGuests([]));
    return () => {
      alive = false;
    };
  }, [ctx.team.id, reload]);
  const active = (guests ?? []).filter((g) => !g.expired);
  const soon = active.filter((g) => g.guestUntil && (new Date(g.guestUntil).getTime() - now) / 86400000 <= 7).length;
  const daysLeft = (g: TeamGuest) => (g.guestUntil ? Math.max(0, Math.ceil((new Date(g.guestUntil).getTime() - now) / 86400000)) : null);
  const level = (g: TeamGuest) => ((g.spaces ?? []).some((s) => s.role === "editor" || s.role === "edit") ? "tp.role.edit" : "tp.role.view");
  return (
    <SxPage parent={t("ay.manage.title")} title={t("ay.team.guests")} backHref={back(ctx)} testId="team-guests-page">
      <p className="s" style={{ margin: "8px 20px 14px" }}>{t("ay.team.guestsDesc2")}</p>
      <div className="stats">
        <div className="stat"><b>{active.length}</b><span>{t("ay.team.activeGuests")}</span></div>
        <div className="stat"><b>{soon}</b><span>{t("ay.team.expiringSoon")}</span></div>
      </div>
      <SxLabel>{t("ay.team.activeGuestsLabel")}</SxLabel>
      <SxCard>
        {active.length === 0 && <SxRow title={t("ay.team.noGuests")} />}
        {active.map((g, i) => {
          const left = daysLeft(g);
          return (
            <Fragment key={g.userId}>
              {i > 0 && <SxSep />}
              <SxRow top lead={<SxAvatar name={g.displayName || g.username} src={g.avatarUrl} />} title={g.displayName || g.username} desc={`${t("ay.team.projectCount", { count: (g.spaces ?? []).length })} · ${t(level(g) as TranslationKey)}`}>
                {left !== null && (
                  <div className="s">
                    <SxTag tone={left <= 7 ? "dg" : undefined}>{t("ay.team.daysLeft", { count: left })}</SxTag>
                  </div>
                )}
                <div className="s">{t("ay.team.joined", { when: formatRelativeTime(g.joinedAt, language) })}</div>
              </SxRow>
              <div style={{ display: "flex", gap: 8, paddingBottom: 14 }}>
                <SxBtn sm disabled={action.busy} onClick={() => void action.run(async () => { await extendGuest(ctx.team.id, g.userId, 30); setReload((n) => n + 1); return true; })}>{t("ay.team.extend")}</SxBtn>
                <SxBtn sm onClick={() => router.push(teamLink(ctx.team.id, "projects"))}>{t("ay.team.editProjects")}</SxBtn>
              </div>
            </Fragment>
          );
        })}
      </SxCard>
      <SxLabel>{t("ay.team.guestInviter")}</SxLabel>
      <SxCard>
        <SxRow href={teamLink(ctx.team.id, "admin", { section: "policies" })} title={t("ay.team.whoInvitesGuests")} desc={t("ay.team.changeInPolicies")} trailing={<SxVal>{ctx.policy ? t(roleLabelKey(ctx.policy.guestInviteRole)) : ""}</SxVal>} />
      </SxCard>
      <SxGap h={16} />
      <SxNote><b>{t("ay.team.guestCannotTitle")}</b> {t("ay.team.guestCannot")}</SxNote>
    </SxPage>
  );
}

// ---------------------------------------------------------------------------------------------
// E3 · Denetim günlüğü
// ---------------------------------------------------------------------------------------------

const AUDIT_CHIPS = ["all", "role", "access", "deletes"] as const;
const CHIP_LABEL: Record<(typeof AUDIT_CHIPS)[number], TranslationKey> = { all: "tm.audit.allEvents", role: "ay.team.chipRole", access: "ay.team.chipAccess", deletes: "ay.team.deletes" };

function AuditPage({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const [category, setCategory] = useState<(typeof AUDIT_CHIPS)[number]>("all");
  const [days, setDays] = useState(30);
  const [entries, setEntries] = useState<TeamAuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [picker, setPicker] = useState(false);
  useEffect(() => {
    let alive = true;
    void listAudit(ctx.team.id, category === "all" || category === "deletes" ? null : category, days, null).then((rows) => {
      if (!alive) return;
      setEntries((category === "deletes" ? rows.filter((e) => /delet|remov/.test(e.action)) : rows).slice(0, 30));
      setMore(rows.length > 30);
    }, () => undefined);
    void fetchAuditStats(ctx.team.id, days).then((v) => alive && setStats(v), () => undefined);
    return () => {
      alive = false;
    };
  }, [ctx.team.id, category, days]);
  async function loadMore() {
    const last = entries[entries.length - 1]?.createdAt ?? null;
    const rows = await listAudit(ctx.team.id, category === "all" || category === "deletes" ? null : category, days, last);
    setEntries((prev) => [...prev, ...(category === "deletes" ? rows.filter((e) => /delet|remov/.test(e.action)) : rows).slice(0, 30)]);
    setMore(rows.length > 30);
  }
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    return diff === 0 ? t("tm.audit.today") : diff === 1 ? t("tm.audit.yesterday") : d.toLocaleDateString(language === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "short" });
  };
  const groups = useMemo(() => {
    const out: { label: string; rows: TeamAuditEntry[] }[] = [];
    for (const e of entries) {
      const label = dayKey(e.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(e);
      else out.push({ label, rows: [e] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey dile bağlıdır
  }, [entries, language]);
  const sentence = (e: TeamAuditEntry) => auditSentence(t, e);
  return (
    <SxPage
      parent={t("ay.manage.title")}
      title={t("ay.team.audit")}
      backHref={back(ctx)}
      testId="team-audit-page"
      action={<SxBarAction onClick={() => undefined}>CSV</SxBarAction>}
    >
      <ChoiceGroup<(typeof AUDIT_CHIPS)[number]>
        variant="sx-chips"
        className="mt10"
        ariaLabel={t("tm.admin.audit.category")}
        value={category}
        onChange={setCategory}
        options={AUDIT_CHIPS.map((k) => ({ key: k, label: t(CHIP_LABEL[k]) }))}
      />
      <SxGap h={12} />
      <div className="chips">
        <SxBtn tone="sel" onClick={() => setPicker(true)}>{t("tm.audit.lastDays", { count: days })}</SxBtn>
      </div>
      <SxGap h={14} />
      <div className="stats">
        <div className="stat"><b>{stats?.total ?? "–"}</b><span>{t("ay.team.events")}</span></div>
        <div className="stat"><b>{stats?.roleAccess ?? "–"}</b><span>{t("ay.team.roleAccess")}</span></div>
        <div className="stat"><b>{stats?.deletes ?? "–"}</b><span>{t("ay.team.deletes")}</span></div>
      </div>
      {groups.map((g) => (
        <Fragment key={g.label}>
          <SxLabel>{g.label}</SxLabel>
          <SxCard>
            {g.rows.map((e) => (
              <SxRow key={e.id} top lead={<SxAvatar name={e.actorName ?? e.actorUsername ?? "?"} src={e.actorAvatarUrl} />} title={e.actorName || e.actorUsername || t("tm.admin.audit.system")} desc={sentence(e)}>
                <div className="s">
                  <SxTag tone={e.category === "approval" ? "ok" : e.category === "role" ? "or" : undefined}>{t(`tm.audit.tag.${e.category}` as "tm.audit.tag.member")}</SxTag> {new Date(e.createdAt).toLocaleTimeString(language === "en" ? "en-GB" : "tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </SxRow>
            ))}
          </SxCard>
        </Fragment>
      ))}
      {more && <LoadMoreButton onLoadMore={() => void loadMore()} label={t("common.loadMore")} />}
      <SxGap h={16} />
      <SxNote>{t("ay.team.csvNoteA")} <b>{t("ay.team.csvNoteB")}</b> {t("ay.team.csvNoteC")}</SxNote>
      <SxPicker<string>
        open={picker}
        onClose={() => setPicker(false)}
        parent={t("ay.team.audit")}
        title={t("tm.panel.range")}
        options={[7, 30, 90].map((d) => ({ key: String(d), label: t("tm.audit.lastDays", { count: d }) }))}
        value={String(days)}
        onPick={(k) => setDays(Number(k))}
        pickLabel={t("ay.pick")}
      />
    </SxPage>
  );
}

// ---------------------------------------------------------------------------------------------
// D2 · Sahiplik ve silme · D3 · Ekibi silme onayı
// ---------------------------------------------------------------------------------------------

function DangerPage({ ctx, sub, go }: { ctx: TeamCtx; sub: string | null; go: (section: string | null, sub?: string | null, key?: string | null) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { team } = ctx;
  const [candidates, setCandidates] = useState<TeamMember[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [deleteSpaces, setDeleteSpaces] = useState(false);
  const transfer = useAsyncAction();
  const del = useAsyncAction();
  useEffect(() => {
    let alive = true;
    void listTeamMembers(team.id, "", null, 0).then((p) => alive && setCandidates(p.items.filter((m) => m.role !== "owner" && m.role !== "guest")), () => undefined);
    return () => {
      alive = false;
    };
  }, [team.id]);
  const chosen = candidates.find((m) => m.userId === target);
  return (
    <>
      <SxPage parent={t("ay.manage.title")} title={t("ay.team.ownership")} backHref={back(ctx)} testId="team-danger-page">
        <p className="s" style={{ margin: "8px 20px 0" }}>{t("ay.team.ownerOnly")}</p>
        <SxLabel>{t("ay.team.transferLabel")}</SxLabel>
        <SxCard>
          <SxRowCol title={t("ay.team.newOwner")} desc={t("ay.team.newOwnerDesc")} />
          <SxRow nav title={t("ay.team.pickMember")} desc={t("ay.team.pickMemberDesc")} trailing={<SxVal>{chosen ? chosen.displayName || chosen.username : t("ay.team.notChosen")}</SxVal>} onClick={() => go("danger", "pick")} />
          <div style={{ paddingBottom: 14 }}>
            <SxBtn tone="out" disabled={!target || transfer.busy} onClick={() => void transfer.run(async () => { await transferOwnership(team.id, target!); ctx.reload(); router.replace(back(ctx)); return true; })}>{t("ay.team.transferBtn")}</SxBtn>
          </div>
        </SxCard>
        <SxLabel>{t("ay.danger.label")}</SxLabel>
        <SxCard>
          <SxRowCol title={t("ay.team.deleteTitle")} desc={t("ay.team.deleteDesc")}>
            <SxBtn tone="dng" onClick={() => go("danger", "delete")}>{t("ay.team.deleteTitle")}</SxBtn>
          </SxRowCol>
        </SxCard>
        <SxGap h={16} />
        <SxNote><b>{t("ay.team.transferNoteTitle")}</b> {t("ay.team.transferNote")}</SxNote>
        {transfer.error && (
          <>
            <SxGap h={12} />
            <SxNote><span className="dgt">{transfer.error}</span></SxNote>
          </>
        )}
      </SxPage>
      <SxPicker<string>
        open={sub === "pick"}
        onClose={() => go("danger")}
        parent={t("ay.team.ownership")}
        title={t("ay.team.pickMember")}
        intro={t("ay.team.pickMemberDesc")}
        label={t("ay.team.membersLabel")}
        options={candidates.map((m) => ({ key: m.userId, label: m.displayName || m.username, desc: `@${m.username}` }))}
        value={target}
        onPick={setTarget}
        pickLabel={t("ay.pick")}
        testId="team-owner-picker"
      />
      {sub === "delete" && (
        <SxConfirmPage
          parent={t("ay.team.ownership")}
          title={t("ay.team.confirmTitle", { name: team.name })}
          lead={t("ay.team.confirmLead", { members: team.memberCount, projects: team.spaceCount })}
          extra={
            <>
              <SxLabel>{t("ay.team.options")}</SxLabel>
              <SxCard>
                <SxRow top title={t("ay.team.deleteSpaces")} desc={t("ay.team.deleteSpacesDesc")} trailing={<SxSwitch checked={deleteSpaces} onChange={setDeleteSpaces} label={t("ay.team.deleteSpaces")} />} />
              </SxCard>
            </>
          }
          typeLabel={t("ay.team.typeName")}
          typePlaceholder={team.name}
          typeValue={typed}
          onTypeChange={setTyped}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("ay.team.deleteBtn")}
          disabled={typed.trim() !== team.name}
          busy={del.busy}
          error={del.error}
          onClose={() => go("danger")}
          onConfirm={() => void del.run(async () => { await deleteTeam(team.id, typed.trim(), deleteSpaces); router.push("/teams"); return true; })}
          testId="team-delete-page"
        />
      )}
    </>
  );
}

