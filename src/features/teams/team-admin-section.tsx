"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check } from "@/components/icons/check";
import { X } from "@/components/icons/x";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import { LoadMoreButton } from "@/features/feed/load-more";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useToast } from "@/features/groups/use-toast";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { teamSystemTranslations } from "@/lib/i18n/translations-team-system";
import {
  deleteTeam,
  exportTeam,
  fetchAuditStats,
  fetchIntegrations,
  listAudit,
  listTeamMembers,
  setApiBlock,
  transferOwnership,
  updateTeam,
  type TeamActionError,
  type TeamAuditEntry,
  type TeamIntegrations,
  type TeamMember,
  type TeamPolicy,
} from "@/lib/supabase/teams";
import { developerEndpoints, teamMcpUrl } from "@/lib/developers";
import { teamLink, teamRoleCan, type TeamRole } from "@/lib/teams";
import { absoluteUrl, cn, formatRelativeTime } from "@/lib/utils";
import { AdminAccessSection, AdminGroupsSection, AdminGuestsSection } from "./team-admin-access";
import { InvitesPanel } from "./team-invites";
import type { TeamCtx } from "./team-page";
import { Panel, StatTile, Switch, TEAM_TONES, TeamMark, roleLabelKey } from "./team-ui";

type Section = "general" | "policies" | "invites" | "access" | "groups" | "guests" | "integrations" | "audit" | "export" | "danger";

/** Yönetim sekmesi: yetenek başına görünen bölümler (gizlemek yalnız görünümdür, her işlem sunucuda yeniden denetlenir). */
export function TeamAdminSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, can } = ctx;
  const router = useRouter();
  const params = useSearchParams();

  const items: SectionMenuItem<Section>[] = useMemo(() => {
    const list: SectionMenuItem<Section>[] = [];
    if (can("manage_team")) list.push({ key: "general", label: t("tm.admin.general") }, { key: "policies", label: t("tm.admin.policies") });
    if (can("manage_members")) list.push({ key: "invites", label: t("tm.admin.invites") }, { key: "access", label: t("tm.admin.access") });
    if (can("manage_groups")) list.push({ key: "groups", label: t("tm.admin.groups") });
    if (can("manage_members")) list.push({ key: "guests", label: t("tm.admin.guests") });
    if (can("manage_team")) list.push({ key: "integrations", label: t("tm.admin.integrations") });
    if (can("view_audit")) list.push({ key: "audit", label: t("tm.admin.audit") });
    if (can("export")) list.push({ key: "export", label: t("tm.admin.export") });
    if (team.myRole === "owner") list.push({ key: "danger", label: t("tm.admin.danger"), dividerBefore: true });
    return list;
  }, [can, t, team.myRole]);

  const raw = params.get("section") as Section | null;
  const active: Section = items.find((i) => i.key === raw)?.key ?? items[0]?.key ?? "general";
  const body = (() => {
    switch (active) {
      case "general":
        return <GeneralSection ctx={ctx} />;
      case "policies":
        return <PoliciesSection ctx={ctx} />;
      case "invites":
        return <InvitesPanel ctx={ctx} />;
      case "access":
        return <AdminAccessSection ctx={ctx} />;
      case "groups":
        return <AdminGroupsSection ctx={ctx} />;
      case "guests":
        return <AdminGuestsSection ctx={ctx} />;
      case "integrations":
        return <IntegrationsSection ctx={ctx} />;
      case "audit":
        return <AuditSection ctx={ctx} />;
      case "export":
        return <ExportSection ctx={ctx} />;
      default:
        return <DangerSection ctx={ctx} />;
    }
  })();

  const go = (key: Section) => router.replace(teamLink(team.id, "admin", { section: key }));
  return (
    <section className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-8" data-testid="team-admin">
      <nav aria-label={t("tm.admin.aria")} className="sticky top-4 space-y-0.5 max-md:hidden" data-admin-nav>
        {items.map((item) => (
          <div key={item.key} className={cn(item.dividerBefore && "mt-2 border-t border-border-soft pt-2")}>
            <button
              type="button"
              onClick={() => go(item.key)}
              aria-current={active === item.key ? "page" : undefined}
              data-admin-nav-item={item.key}
              className={cn(
                "flex h-10 w-full items-center rounded-lg px-3 text-left text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active === item.key ? "bg-primary-soft font-bold text-primary" : "text-text-secondary hover:bg-surface-soft hover:text-text",
              )}
            >
              {item.label}
            </button>
          </div>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
        <div className="md:hidden">
          <SectionMenu items={items} active={active} onChange={go} ariaLabel={t("tm.admin.aria")} title={t("tm.admin.aria")} />
        </div>
        {body}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function useSave(ctx: TeamCtx) {
  const { node, show } = useToast();
  const { t } = useTranslation();
  const save = async (patch: Record<string, unknown>): Promise<boolean> => {
    try {
      await updateTeam(ctx.team.id, patch);
      show(t("tm.admin.saved"));
      ctx.reload();
      return true;
    } catch (error) {
      show((error as TeamActionError).message);
      return false;
    }
  };
  return { node, save, show };
}

function GeneralSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team } = ctx;
  const { node, save } = useSave(ctx);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [tone, setTone] = useState(team.tone);
  return (
    <Panel title={t("tm.admin.general")} hint={t("tm.admin.generalHint")}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ name: name.trim(), description: description.trim(), tone });
        }}
      >
        <div>
          <label htmlFor="team-set-name" className={fieldLabelClassName}>
            {t("tm.create.name")}
          </label>
          <input id="team-set-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={fieldInputClassName} />
        </div>
        <div>
          <label htmlFor="team-set-desc" className={fieldLabelClassName}>
            {t("tm.create.description")}
          </label>
          <textarea id="team-set-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-small" />
        </div>
        <div>
          <span className={fieldLabelClassName}>{t("tm.create.tone")}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("tm.create.tone")}>
            {TEAM_TONES.map((option) => (
              <button key={option} type="button" role="radio" aria-checked={tone === option} onClick={() => setTone(option)} className={`rounded-xl p-0.5 ${tone === option ? "ring-2 ring-primary" : ""}`}>
                <TeamMark name={name || "?"} tone={option} size={36} />
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={name.trim().length < 2}>
          {t("common.save")}
        </Button>
      </form>
      {node}
    </Panel>
  );
}

/** Politika satırı (mockup): solda ad + ipucu, sağda kontrol (anahtar ya da hap biçimli seçici). */
function PolicyRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" data-policy-row>
      <span className="min-w-0">
        <span className="block text-small font-bold text-text">{label}</span>
        {hint && <span className="block text-caption text-text-muted">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

function PillSelect<K extends string>({ label, value, options, onChange }: { label: string; value: K; options: { key: K; label: string }[]; onChange: (key: K) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as K)} aria-label={label} className="h-9 max-w-[11rem] rounded-full border border-border bg-background pl-3.5 pr-2 text-caption font-bold text-text">
      {options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Kaydet tek düğmedir: değişiklikler yerelde birikir, "Kaydet" tek `team_update` çağrısıyla yazar (mockup; her dokunuşta kayıt yok). */
type PolicyDraft = Partial<{ [K in keyof TeamPolicy]: TeamPolicy[K] }>;
const POLICY_SNAKE: Record<keyof TeamPolicy, string> = {
  requireApproval: "require_approval",
  approvalsNeeded: "approvals_needed",
  hideUnapproved: "hide_unapproved",
  contentOwner: "content_owner",
  offboardDefault: "offboard_default",
  versionKeep: "version_keep",
  defaultMemberRole: "default_member_role",
  inviteLinkTtlDays: "invite_link_ttl_days",
  publishExternalRole: "publish_external_role",
  guestInviteRole: "guest_invite_role",
  exportRole: "export_role",
  mcpEnabled: "mcp_enabled",
  mcpAudience: "mcp_audience",
};

function PoliciesSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { node, save } = useSave(ctx);
  const policy = ctx.policy;
  const [draft, setDraft] = useState<PolicyDraft>({});
  const [busy, setBusy] = useState(false);
  if (!policy) return <p className="text-small text-text-muted">{t("common.loading")}</p>;
  const value = <K extends keyof TeamPolicy>(key: K): TeamPolicy[K] => (key in draft ? (draft[key] as TeamPolicy[K]) : policy[key]);
  const edit = <K extends keyof TeamPolicy>(key: K, next: TeamPolicy[K]) =>
    setDraft((prev) => {
      const out = { ...prev, [key]: next };
      if (policy[key] === next) delete out[key];
      return out;
    });
  const dirty = Object.keys(draft).length > 0;
  const submit = async () => {
    setBusy(true);
    const patch: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(draft)) patch[POLICY_SNAKE[key as keyof TeamPolicy]] = v;
    const ok = await save(patch);
    if (ok) setDraft({});
    setBusy(false);
  };
  const num = (key: "approvalsNeeded" | "versionKeep" | "inviteLinkTtlDays") => String(value(key));
  const roleOptions = <R extends "owner" | "admin" | "editor">(keys: R[]) => keys.map((key) => ({ key, label: t(`tm.role.${key}` as "tm.role.owner") }));
  const rolePolicy = { publish_external_role: value("publishExternalRole"), guest_invite_role: value("guestInviteRole"), export_role: value("exportRole") };
  const approvers = (["owner", "admin", "editor"] as const).filter((role) => teamRoleCan(role, "approve_library", rolePolicy)).map((role) => t(`tm.role.${role}` as "tm.role.owner"));
  const card = "rounded-xl border border-border-soft bg-surface px-4 pb-1 pt-3";
  const cardTitle = "mb-1 border-b border-border-soft pb-2 text-body font-bold text-text";
  return (
    <div className="space-y-4" data-testid="team-policies">
      <div className="flex items-start gap-3">
        <div className="mr-auto min-w-0">
          <h2 className="font-display text-h2 font-bold max-md:hidden">{t("tm.admin.policies")}</h2>
          <p className="text-small text-text-secondary max-md:hidden">{t("tm.admin.policy.intro")}</p>
        </div>
        <Button type="button" onClick={() => void submit()} disabled={!dirty || busy} data-policy-save className="max-md:ml-auto">
          {t("common.save")}
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <section className={card}>
            <h3 className={cardTitle}>{t("tm.admin.policy.library")}</h3>
            <div className="divide-y divide-border-soft">
              <PolicyRow label={t("tm.admin.policy.requireApproval")} hint={t("tm.admin.policy.requireApprovalHint")}>
                <Switch checked={value("requireApproval")} onChange={(v) => edit("requireApproval", v)} label={t("tm.admin.policy.requireApproval")} />
              </PolicyRow>
              <PolicyRow label={t("tm.admin.policy.approvalsNeeded")} hint={t("tm.admin.policy.approvalsNeededHint")}>
                <PillSelect label={t("tm.admin.policy.approvalsNeeded")} value={num("approvalsNeeded") as "1" | "2" | "3"} options={(["1", "2", "3"] as const).map((k) => ({ key: k, label: t("tm.admin.policy.nApprovals", { count: Number(k) }) }))} onChange={(k) => edit("approvalsNeeded", Number(k))} />
              </PolicyRow>
              <PolicyRow label={t("tm.admin.policy.approvers")} hint={t("tm.admin.policy.approversHint")}>
                <span className="inline-flex h-9 items-center rounded-full border border-border-soft bg-surface-soft px-3.5 text-caption font-bold text-text-secondary" data-policy-approvers>
                  {approvers.join(" + ")}
                </span>
              </PolicyRow>
              <PolicyRow label={t("tm.admin.policy.hideUnapproved")} hint={t("tm.admin.policy.hideUnapprovedHint")}>
                <Switch checked={value("hideUnapproved")} onChange={(v) => edit("hideUnapproved", v)} label={t("tm.admin.policy.hideUnapproved")} />
              </PolicyRow>
            </div>
          </section>
          <section className={card}>
            <h3 className={cardTitle}>{t("tm.admin.policy.sharing")}</h3>
            <div className="divide-y divide-border-soft">
              <PolicyRow label={t("tm.admin.policy.publishExternal")} hint={t("tm.admin.policy.publishExternalHint")}>
                <PillSelect label={t("tm.admin.policy.publishExternal")} value={value("publishExternalRole")} options={roleOptions(["owner", "admin", "editor"])} onChange={(k) => edit("publishExternalRole", k)} />
              </PolicyRow>
              <PolicyRow label={t("tm.admin.policy.guestInvite")} hint={t("tm.admin.policy.guestInviteHint")}>
                <PillSelect label={t("tm.admin.policy.guestInvite")} value={value("guestInviteRole")} options={roleOptions(["owner", "admin", "editor"])} onChange={(k) => edit("guestInviteRole", k)} />
              </PolicyRow>
              <PolicyRow label={t("tm.admin.policy.exportRole")} hint={t("tm.admin.policy.exportRoleHint")}>
                <PillSelect label={t("tm.admin.policy.exportRole")} value={value("exportRole")} options={roleOptions(["owner", "admin"])} onChange={(k) => edit("exportRole", k)} />
              </PolicyRow>
            </div>
          </section>
        </div>
        <div className="space-y-4">
          <section className={card}>
            <h3 className={cardTitle}>{t("tm.admin.policy.ownership")}</h3>
            <div className="divide-y divide-border-soft">
              <PolicyRow label={t("tm.admin.policy.contentOwner")} hint={t("tm.admin.policy.contentOwnerHint")}>
                <PillSelect label={t("tm.admin.policy.contentOwner")} value={value("contentOwner")} options={[{ key: "team", label: t("tm.admin.policy.owner.team") }, { key: "author", label: t("tm.admin.policy.owner.author") }]} onChange={(k) => edit("contentOwner", k)} />
              </PolicyRow>
              <PolicyRow label={t("tm.admin.policy.offboard")} hint={t("tm.admin.policy.offboardHint")}>
                <PillSelect label={t("tm.admin.policy.offboard")} value={value("offboardDefault")} options={[{ key: "ask", label: t("tm.admin.policy.offboard.ask") }, { key: "team", label: t("tm.admin.policy.offboard.team") }, { key: "admin", label: t("tm.admin.policy.offboard.admin") }]} onChange={(k) => edit("offboardDefault", k)} />
              </PolicyRow>
              <PolicyRow label={t("tm.admin.policy.versionKeep")} hint={t("tm.admin.policy.versionKeepHint")}>
                <PillSelect label={t("tm.admin.policy.versionKeep")} value={num("versionKeep") as "10" | "25" | "50" | "100"} options={(["10", "25", "50", "100"] as const).map((k) => ({ key: k, label: t("tm.admin.policy.nVersions", { count: Number(k) }) }))} onChange={(k) => edit("versionKeep", Number(k))} />
              </PolicyRow>
            </div>
          </section>
          <section className={card}>
            <h3 className={cardTitle}>{t("tm.admin.policy.joining")}</h3>
            <div className="divide-y divide-border-soft">
              <PolicyRow label={t("tm.admin.policy.defaultRole")} hint={t("tm.admin.policy.defaultRoleHint")}>
                <PillSelect label={t("tm.admin.policy.defaultRole")} value={value("defaultMemberRole")} options={[{ key: "member", label: t("tm.role.member") }, { key: "editor", label: t("tm.role.editor") }]} onChange={(k) => edit("defaultMemberRole", k)} />
              </PolicyRow>
              <PolicyRow label={t("tm.admin.policy.linkTtl")} hint={t("tm.admin.policy.linkTtlHint")}>
                <PillSelect label={t("tm.admin.policy.linkTtl")} value={num("inviteLinkTtlDays") as "1" | "7" | "14" | "30"} options={(["1", "7", "14", "30"] as const).map((k) => ({ key: k, label: t("tm.panel.days", { count: Number(k) }) }))} onChange={(k) => edit("inviteLinkTtlDays", Number(k))} />
              </PolicyRow>
            </div>
          </section>
        </div>
      </div>
      {node}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function IntegrationsSection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { node, save, show } = useSave(ctx);
  const [data, setData] = useState<TeamIntegrations | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void fetchIntegrations(ctx.team.id).then(setData, (e: TeamActionError) => show(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız ekip/yenileme değişince
  }, [ctx.team.id, tick]);
  const policy = ctx.policy;
  const address = data ? absoluteUrl(`/developers`) : "";
  const endpoints = developerEndpoints(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const mcpAddress = data && endpoints ? teamMcpUrl(endpoints, data.slug) : null;
  const card = "rounded-xl border border-border-soft bg-surface p-4";
  const copy = async () => {
    if (!mcpAddress) return;
    try {
      await navigator.clipboard.writeText(mcpAddress);
      show(t("tm.admin.int.copied"));
    } catch {
      show(t("tm.admin.int.copyFailed"));
    }
  };
  const allowed = ["tm.admin.int.can.prompts", "tm.admin.int.can.variables", "tm.admin.int.can.versions"] as const;
  const denied = ["tm.admin.int.cannot.drafts", "tm.admin.int.cannot.write", "tm.admin.int.cannot.chat"] as const;
  const steps = ["tm.admin.int.step1", "tm.admin.int.step2", "tm.admin.int.step3"] as const;
  const block = (app: TeamIntegrations["apps"][number]) => (
    <button
      type="button"
      onClick={() => void setApiBlock(ctx.team.id, app.userId, app.tokenId, !app.blocked).then(() => setTick((n) => n + 1), (e: TeamActionError) => show(e.message))}
      className={cn(
        "h-8 rounded-full border px-3.5 text-caption font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        app.blocked ? "border-border bg-surface text-text hover:bg-surface-soft" : "border-danger/40 bg-surface text-danger hover:bg-danger/10",
      )}
      data-int-block
    >
      {t(app.blocked ? "tm.admin.int.unblock" : "tm.admin.int.block")}
    </button>
  );
  return (
    <div className="space-y-4" data-testid="team-integrations">
      <div className="max-md:hidden">
        <h2 className="font-display text-h2 font-bold">{t("tm.admin.integrations")}</h2>
        <p className="text-small text-text-secondary">{t("tm.admin.int.subtitle")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <section className={card} data-int-connector>
          <h3 className="mb-1 text-body font-bold">{t("tm.admin.int.connectorTitle")}</h3>
          <p className="mb-3 text-small text-text-secondary md:hidden">{t("tm.admin.int.subtitleShort")}</p>
          {mcpAddress ? (
            <div className="flex items-center gap-2">
              <input readOnly value={mcpAddress} onFocus={(e) => e.currentTarget.select()} aria-label={t("tm.admin.int.mcpAddress")} className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface-soft px-3 font-mono text-caption text-text" data-int-address />
              <Button type="button" onClick={() => void copy()} data-int-copy>
                {t("tm.admin.int.copy")}
              </Button>
            </div>
          ) : (
            <p className="text-small text-text-muted">{data ? t("tm.admin.int.noAddress") : t("common.loading")}</p>
          )}
          <ol className="mt-4 space-y-3 text-small text-text-secondary">
            {steps.map((key, index) => (
              <li key={key} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-soft text-caption font-bold text-primary">{index + 1}</span>
                <span className="pt-0.5">{t(key)}</span>
              </li>
            ))}
          </ol>
          {data && (
            <p className="mt-3 text-caption text-text-muted">
              {t("tm.admin.int.slug", { slug: data.slug })} · <a href={address} className="text-primary hover:underline">{t("tm.admin.int.docs")}</a>
            </p>
          )}
        </section>
        <section className={card} data-int-access>
          <h3 className="mb-3 text-body font-bold">{t("tm.admin.int.whatAccess")}</h3>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-small lg:grid-cols-1">
            {allowed.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/10 text-success" aria-hidden>
                  <Check size={12} />
                </span>
                {t(key)}
              </li>
            ))}
            {denied.map((key) => (
              <li key={key} className="flex items-center gap-2 text-text-secondary">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-soft text-text-muted" aria-hidden>
                  <X size={12} />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={card} data-int-audience>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-small font-bold">{t("tm.admin.int.audience")}</span>
              <span className="block text-caption text-text-muted">{t("tm.admin.int.guestsNever")}</span>
            </span>
            {policy && (
              <PillSelect
                label={t("tm.admin.int.audience")}
                value={policy.mcpAudience}
                options={[{ key: "members", label: t("tm.admin.int.aud.members") }, { key: "editors", label: t("tm.admin.int.aud.editors") }, { key: "admins", label: t("tm.admin.int.aud.admins") }]}
                onChange={(key) => void save({ mcp_audience: key })}
              />
            )}
          </div>
          {policy && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-soft pt-3">
              <span className="min-w-0">
                <span className="block text-small font-bold">{t("tm.admin.int.enabled")}</span>
                <span className="block text-caption text-text-muted">{t("tm.admin.int.enabledHint")}</span>
              </span>
              <Switch checked={policy.mcpEnabled} onChange={(v) => void save({ mcp_enabled: v }).then(() => setTick((n) => n + 1))} label={t("tm.admin.int.enabled")} />
            </div>
          )}
        </section>
        <section className={card} data-int-reads>
          <p className="text-caption text-text-muted">{t("tm.admin.int.monthTotal")}</p>
          <p className="mt-1 font-display text-h2 font-bold tabular-nums">{data ? data.monthReads.toLocaleString(language === "en" ? "en-US" : "tr-TR") : "–"}</p>
        </section>
      </div>
      <section className="rounded-xl border border-border-soft bg-surface" data-int-apps>
        <div className="flex items-center justify-between gap-3 px-4 pt-4 md:hidden">
          <h3 className="text-body font-bold">{t("tm.admin.int.appsShort")}</h3>
          {data && <span className="text-caption text-text-muted">{t("tm.admin.int.monthReadsShort", { count: data.monthReads })}</span>}
        </div>
        {data && data.apps.length === 0 && <p className="px-4 py-4 text-small text-text-muted">{t("tm.admin.int.noApps")}</p>}
        {data && data.apps.length > 0 && (
          <>
            <table className="hidden w-full text-small md:table">
              <thead className="bg-surface-soft text-caption uppercase tracking-[0.06em] text-text-muted">
                <tr className="text-left">
                  <th className="rounded-tl-xl px-4 py-2.5 font-bold">{t("tm.admin.int.col.app")}</th>
                  <th className="px-4 py-2.5 font-bold">{t("tm.admin.int.col.last")}</th>
                  <th className="px-4 py-2.5 font-bold">{t("tm.admin.int.col.reads")}</th>
                  <th className="rounded-tr-xl px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {data.apps.map((app) => (
                  <tr key={`${app.userId}-${app.tokenId ?? app.via}`} data-int-app>
                    <td className="px-4 py-3">
                      <span className="font-bold text-text">{app.name}</span> <span className="text-caption text-text-muted">{app.userName}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatRelativeTime(app.lastDay, language)}</td>
                    <td className="px-4 py-3 tabular-nums text-text-secondary">{app.reads}</td>
                    <td className="px-4 py-3 text-right">{block(app)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-border-soft px-4 pb-1 md:hidden">
              {data.apps.map((app) => (
                <li key={`${app.userId}-${app.tokenId ?? app.via}`} className="flex items-center gap-3 py-3" data-int-app>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-bold">
                      {app.name} <span className="text-caption font-normal text-text-muted">{app.userName}</span>
                    </span>
                    <span className="block text-caption text-text-muted">
                      {formatRelativeTime(app.lastDay, language)} · {t("tm.admin.int.reads", { count: app.reads })}
                    </span>
                  </span>
                  {block(app)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {node}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const AUDIT_CATEGORIES = ["all", "member", "role", "access", "approval", "library", "channel", "policy", "integration"] as const;
type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

const AUDIT_TAG_TONE: Record<string, string> = {
  approval: "bg-success/10 text-success",
  role: "bg-primary-soft text-primary",
  access: "bg-warning/10 text-warning",
  member: "bg-primary-soft text-primary",
  library: "bg-danger/10 text-danger",
  channel: "bg-surface-soft text-text-secondary",
  policy: "bg-surface-soft text-text-secondary",
  integration: "bg-secondary/10 text-secondary",
};

/** "Bugün 10:18" / "Dün 17:42" / "3 Kas" (mockup: sol zaman sütunu). */
function auditTime(t: ReturnType<typeof useTranslation>["t"], language: string, iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  const clock = date.toLocaleTimeString(language === "en" ? "en-GB" : "tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `${t("tm.audit.today")} ${clock}`;
  if (diffDays === 1) return `${t("tm.audit.yesterday")} ${clock}`;
  return date.toLocaleDateString(language === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "short" });
}

/** Eylem cümlesi: bilinen eylem çevrilir, bilinmeyen eylem ham anahtar yerine okunur bir metne düşer (yeni SQL eylemi çeviri beklemeden bozuk görünmez). */
function auditSentence(t: ReturnType<typeof useTranslation>["t"], entry: TeamAuditEntry): string {
  const key = `tm.audit.action.${entry.action}` as TranslationKey;
  let text = auditKeyKnown(key) ? t(key) : entry.action.replace(/_/g, " ");
  const details = entry.details ?? {};
  if (entry.action === "role_changed" && typeof details.from === "string" && typeof details.to === "string") {
    const label = (role: string) => (["owner", "admin", "editor", "member", "guest"].includes(role) ? t(roleLabelKey(role as TeamRole)) : role);
    text += ` ${label(details.from)} → ${label(details.to)}`;
  }
  return entry.targetLabel ? `${text} · ${entry.targetLabel}` : text;
}

const auditKeyKnown = (key: string) => key in teamSystemTranslations;

function csvEscape(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function AuditSection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { node, show } = useToast();
  const [category, setCategory] = useState<AuditCategory>("all");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [entries, setEntries] = useState<TeamAuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listAudit(ctx.team.id, category === "all" ? null : category, days, null).then(
      (rows) => {
        if (cancelled) return;
        setEntries(rows.slice(0, 30));
        setMore(rows.length > 30);
        setError(null);
      },
      (e: TeamActionError) => !cancelled && setError(e.message),
    );
    void fetchAuditStats(ctx.team.id, days).then((v) => !cancelled && setStats(v), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [ctx.team.id, category, days]);

  const loadMore = async () => {
    const last = entries[entries.length - 1]?.createdAt ?? null;
    const rows = await listAudit(ctx.team.id, category === "all" ? null : category, days, last);
    setEntries((prev) => [...prev, ...rows.slice(0, 30)]);
    setMore(rows.length > 30);
  };

  /** CSV: seçili süzgeç + aralıktaki TÜM kayıtlar (sayfa sayfa okunur, en çok 2000 satır); ekranda yüklenenle sınırlı değildir. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: TeamAuditEntry[] = [];
      let before: string | null = null;
      for (let page = 0; page < 70; page += 1) {
        const rows = await listAudit(ctx.team.id, category === "all" ? null : category, days, before);
        all.push(...rows.slice(0, 30));
        if (rows.length <= 30) break;
        before = all[all.length - 1]?.createdAt ?? null;
      }
      const lines = [[t("tm.audit.csv.time"), t("tm.audit.csv.actor"), t("tm.audit.csv.category"), t("tm.audit.csv.event")]].concat(
        all.map((entry) => [entry.createdAt, entry.actorName || entry.actorUsername || t("tm.admin.audit.system"), t(`tm.audit.tag.${entry.category}` as "tm.audit.tag.member"), auditSentence(t, entry)]),
      );
      download(`${ctx.team.slug}-audit.csv`, "\ufeff" + lines.map((row) => row.map(csvEscape).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    } catch (e) {
      show((e as TeamActionError).message);
    } finally {
      setExporting(false);
    }
  };

  const categoryItems: SectionMenuItem<AuditCategory>[] = AUDIT_CATEGORIES.map((key) => ({ key, label: key === "all" ? t("tm.audit.allEvents") : t(`tm.admin.audit.cat.${key}` as "tm.admin.audit.cat.all") }));
  const dayItems: SectionMenuItem<"7" | "30" | "90">[] = (["7", "30", "90"] as const).map((d) => ({ key: d, label: t("tm.audit.lastDays", { count: Number(d) }) }));

  return (
    <div className="space-y-4" data-testid="team-audit">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-h2 font-bold max-md:hidden">{t("tm.admin.audit")}</h2>
        <SectionMenu items={categoryItems} active={category} onChange={setCategory} ariaLabel={t("tm.admin.audit.category")} title={t("tm.admin.audit.category")} align="end" />
        <SectionMenu items={dayItems} active={String(days) as "7" | "30" | "90"} onChange={(key) => setDays(Number(key) as 7 | 30 | 90)} ariaLabel={t("tm.panel.range")} title={t("tm.panel.range")} align="end" />
        <Button type="button" variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={exporting} data-audit-csv>
          {t("tm.audit.csv")}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3" data-audit-stats>
        <StatTile label={t("tm.admin.audit.total", { count: days })} value={stats?.total ?? "–"} />
        <StatTile label={t("tm.admin.audit.roleAccess")} value={stats?.roleAccess ?? "–"} />
        <StatTile label={t("tm.admin.audit.deletes")} value={stats?.deletes ?? "–"} />
      </div>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      <ul className="rounded-lg border border-border-soft bg-surface md:divide-y md:divide-border-soft max-md:space-y-2 max-md:border-0 max-md:bg-transparent" data-audit-list>
        {entries.length === 0 && !error && <li className="px-4 py-6 text-center text-small text-text-muted">{t("tm.admin.audit.empty")}</li>}
        {entries.map((entry) => {
          const name = entry.actorName || entry.actorUsername || t("tm.admin.audit.system");
          const tag = (
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-caption font-bold", AUDIT_TAG_TONE[entry.category] ?? "bg-surface-soft text-text-secondary")} data-audit-tag={entry.category}>
              {t(`tm.audit.tag.${entry.category}` as "tm.audit.tag.member")}
            </span>
          );
          const time = auditTime(t, language, entry.createdAt);
          return (
            <li key={entry.id} data-audit-row className="flex items-start gap-3 px-4 py-3 text-small md:items-center max-md:rounded-lg max-md:border max-md:border-border-soft max-md:bg-surface">
              <span className="w-24 shrink-0 text-caption text-text-muted max-md:hidden">{time}</span>
              <Avatar src={entry.actorAvatarUrl} alt={name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="font-bold text-text">{name}</span> <span className="text-text-secondary">{auditSentence(t, entry)}</span>
                <span className="mt-1.5 flex items-center gap-2 md:hidden">
                  {tag}
                  <span className="text-caption text-text-muted">{time}</span>
                </span>
              </span>
              <span className="max-md:hidden">{tag}</span>
            </li>
          );
        })}
      </ul>
      {more && <LoadMoreButton onLoadMore={() => void loadMore()} label={t("common.loadMore")} />}
      {node}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function ExportSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { node, show } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Panel title={t("tm.admin.export")} hint={t("tm.admin.exportHint")}>
      <Button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void exportTeam(ctx.team.id)
            .then((data) => download(`${ctx.team.slug}-export.json`, JSON.stringify(data, null, 2)))
            .catch((e: TeamActionError) => show(e.message))
            .finally(() => setBusy(false));
        }}
        data-team-export
      >
        {t("tm.admin.exportButton")}
      </Button>
      <p className="mt-2 text-caption text-text-muted">{t("tm.admin.exportNote")}</p>
      {node}
    </Panel>
  );
}

function DangerSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { node, show } = useToast();
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [candidates, setCandidates] = useState<TeamMember[]>([]);
  const [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleteSpaces, setDeleteSpaces] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transferOpen) void listTeamMembers(ctx.team.id, "", null, 0).then((p) => setCandidates(p.items.filter((m) => m.role !== "owner" && m.role !== "guest")), () => undefined);
  }, [transferOpen, ctx.team.id]);

  return (
    <div className="space-y-4" data-testid="team-danger">
      <Panel title={t("tm.admin.transfer")} hint={t("tm.admin.transferHint")}>
        <Button type="button" variant="outline" onClick={() => setTransferOpen((v) => !v)}>
          {t("tm.admin.transferButton")}
        </Button>
        {transferOpen && (
          <div className="mt-3 flex flex-wrap gap-2">
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t("tm.admin.transferPick")} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-small">
              <option value="">{t("tm.admin.transferPick")}</option>
              {candidates.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName || m.username}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={!target || busy}
              onClick={() => {
                setBusy(true);
                void transferOwnership(ctx.team.id, target).then(
                  () => {
                    show(t("tm.admin.transferred"));
                    ctx.reload();
                    setTransferOpen(false);
                    setBusy(false);
                  },
                  (e: TeamActionError) => {
                    show(e.message);
                    setBusy(false);
                  },
                );
              }}
            >
              {t("tm.admin.transferConfirm")}
            </Button>
          </div>
        )}
      </Panel>
      <Panel title={t("tm.admin.delete")} hint={t("tm.admin.deleteHint")}>
        <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)} data-team-delete>
          {t("tm.admin.deleteButton")}
        </Button>
      </Panel>
      {deleteOpen && (
        <ConfirmDialog
          id="team-delete"
          title={t("tm.admin.deleteTitle", { name: ctx.team.name })}
          body={
            <div className="space-y-3">
              <p>{t("tm.admin.deleteBody")}</p>
              <label className="flex items-center gap-2 text-small">
                <input type="checkbox" checked={deleteSpaces} onChange={(e) => setDeleteSpaces(e.target.checked)} />
                {t("tm.admin.deleteSpaces")}
              </label>
              <label className="block text-small">
                {t("tm.admin.deleteType", { name: ctx.team.name })}
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${fieldInputClassName} mt-1`} autoComplete="off" />
              </label>
            </div>
          }
          confirmLabel={t("tm.admin.deleteButton")}
          confirmDisabled={confirm.trim() !== ctx.team.name}
          danger
          busy={busy}
          error={error}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            setBusy(true);
            void deleteTeam(ctx.team.id, confirm.trim(), deleteSpaces).then(
              () => router.push("/teams"),
              (e: TeamActionError) => {
                setError(e.message);
                setBusy(false);
              },
            );
          }}
        />
      )}
      {node}
    </div>
  );
}
