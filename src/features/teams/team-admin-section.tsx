"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import { LoadMoreButton } from "@/features/feed/load-more";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useToast } from "@/features/groups/use-toast";
import { useTranslation } from "@/lib/i18n/language-provider";
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
import { teamLink } from "@/lib/teams";
import { absoluteUrl, formatRelativeTime } from "@/lib/utils";
import { AdminAccessSection, AdminGroupsSection, AdminGuestsSection } from "./team-admin-access";
import { InvitesPanel } from "./team-invites";
import type { TeamCtx } from "./team-page";
import { Panel, PersonRow, PillChoice, StatTile, TEAM_TONES, TeamMark } from "./team-ui";

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

  return (
    <section className="space-y-4" data-testid="team-admin">
      <SectionMenu items={items} active={active} onChange={(key) => router.replace(teamLink(team.id, "admin", { section: key }))} ariaLabel={t("tm.admin.aria")} title={t("tm.admin.aria")} />
      {body}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function useSave(ctx: TeamCtx) {
  const { node, show } = useToast();
  const { t } = useTranslation();
  const save = async (patch: Record<string, unknown>) => {
    try {
      await updateTeam(ctx.team.id, patch);
      show(t("tm.admin.saved"));
      ctx.reload();
    } catch (error) {
      show((error as TeamActionError).message);
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

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-small font-medium">{label}</span>
        {hint && <span className="block text-caption text-text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-[var(--color-primary)]" />
    </label>
  );
}

function PolicyChoice<K extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: K; options: { key: K; label: string }[]; onChange: (key: K) => void }) {
  return (
    <div className="space-y-2 py-3">
      <div>
        <span className="block text-small font-medium">{label}</span>
        {hint && <span className="block text-caption text-text-muted">{hint}</span>}
      </div>
      <PillChoice<K> ariaLabel={label} value={value} options={options} onChange={onChange} />
    </div>
  );
}

function PoliciesSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { node, save } = useSave(ctx);
  const policy = ctx.policy;
  if (!policy) return <p className="text-small text-text-muted">{t("common.loading")}</p>;
  const set = <K extends keyof TeamPolicy>(snake: string, _key: K, value: TeamPolicy[K] | number | boolean | string) => void save({ [snake]: value });
  const roleOptions = (keys: ("owner" | "admin" | "editor")[]) => keys.map((key) => ({ key, label: t(`tm.role.${key}` as "tm.role.owner") }));
  return (
    <div className="space-y-4" data-testid="team-policies">
      <Panel title={t("tm.admin.policy.library")} hint={t("tm.admin.policy.libraryHint")}>
        <div className="divide-y divide-border-soft">
          <Toggle label={t("tm.admin.policy.requireApproval")} hint={t("tm.admin.policy.requireApprovalHint")} checked={policy.requireApproval} onChange={(v) => set("require_approval", "requireApproval", v)} />
          <PolicyChoice
            label={t("tm.admin.policy.approvalsNeeded")}
            hint={t("tm.admin.policy.approvalsNeededHint")}
            value={String(policy.approvalsNeeded) as "1" | "2" | "3"}
            options={[{ key: "1", label: "1" }, { key: "2", label: "2" }, { key: "3", label: "3" }]}
            onChange={(key) => set("approvals_needed", "approvalsNeeded", Number(key))}
          />
          <Toggle label={t("tm.admin.policy.hideUnapproved")} hint={t("tm.admin.policy.hideUnapprovedHint")} checked={policy.hideUnapproved} onChange={(v) => set("hide_unapproved", "hideUnapproved", v)} />
          <PolicyChoice
            label={t("tm.admin.policy.versionKeep")}
            value={String(policy.versionKeep) as "10" | "25" | "50" | "100"}
            options={(["10", "25", "50", "100"] as const).map((key) => ({ key, label: key }))}
            onChange={(key) => set("version_keep", "versionKeep", Number(key))}
          />
        </div>
      </Panel>
      <Panel title={t("tm.admin.policy.members")}>
        <div className="divide-y divide-border-soft">
          <PolicyChoice
            label={t("tm.admin.policy.contentOwner")}
            hint={t("tm.admin.policy.contentOwnerHint")}
            value={policy.contentOwner}
            options={[{ key: "team", label: t("tm.admin.policy.owner.team") }, { key: "author", label: t("tm.admin.policy.owner.author") }]}
            onChange={(key) => set("content_owner", "contentOwner", key)}
          />
          <PolicyChoice
            label={t("tm.admin.policy.offboard")}
            hint={t("tm.admin.policy.offboardHint")}
            value={policy.offboardDefault}
            options={[{ key: "ask", label: t("tm.admin.policy.offboard.ask") }, { key: "team", label: t("tm.admin.policy.offboard.team") }, { key: "admin", label: t("tm.admin.policy.offboard.admin") }]}
            onChange={(key) => set("offboard_default", "offboardDefault", key)}
          />
          <PolicyChoice
            label={t("tm.admin.policy.defaultRole")}
            value={policy.defaultMemberRole}
            options={[{ key: "member", label: t("tm.role.member") }, { key: "editor", label: t("tm.role.editor") }]}
            onChange={(key) => set("default_member_role", "defaultMemberRole", key)}
          />
          <PolicyChoice
            label={t("tm.admin.policy.linkTtl")}
            value={String(policy.inviteLinkTtlDays) as "1" | "7" | "14" | "30"}
            options={(["1", "7", "14", "30"] as const).map((key) => ({ key, label: t("tm.panel.days", { count: Number(key) }) }))}
            onChange={(key) => set("invite_link_ttl_days", "inviteLinkTtlDays", Number(key))}
          />
        </div>
      </Panel>
      <Panel title={t("tm.admin.policy.thresholds")} hint={t("tm.admin.policy.thresholdsHint")}>
        <div className="divide-y divide-border-soft">
          <PolicyChoice label={t("tm.admin.policy.publishExternal")} value={policy.publishExternalRole} options={roleOptions(["owner", "admin", "editor"])} onChange={(key) => set("publish_external_role", "publishExternalRole", key)} />
          <PolicyChoice label={t("tm.admin.policy.guestInvite")} value={policy.guestInviteRole} options={roleOptions(["owner", "admin", "editor"])} onChange={(key) => set("guest_invite_role", "guestInviteRole", key)} />
          <PolicyChoice label={t("tm.admin.policy.exportRole")} value={policy.exportRole} options={roleOptions(["owner", "admin"])} onChange={(key) => set("export_role", "exportRole", key)} />
        </div>
      </Panel>
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
  return (
    <div className="space-y-4" data-testid="team-integrations">
      <Panel title={t("tm.admin.int.title")} hint={t("tm.admin.int.hint")}>
        {policy && (
          <div className="divide-y divide-border-soft">
            <Toggle label={t("tm.admin.int.enabled")} hint={t("tm.admin.int.enabledHint")} checked={policy.mcpEnabled} onChange={(v) => void save({ mcp_enabled: v }).then(() => setTick((n) => n + 1))} />
            <PolicyChoice
              label={t("tm.admin.int.audience")}
              value={policy.mcpAudience}
              options={[{ key: "members", label: t("tm.admin.int.aud.members") }, { key: "editors", label: t("tm.admin.int.aud.editors") }, { key: "admins", label: t("tm.admin.int.aud.admins") }]}
              onChange={(key) => void save({ mcp_audience: key })}
            />
          </div>
        )}
        {data && (
          <p className="mt-3 rounded-lg bg-surface-soft px-3 py-2 text-caption text-text-secondary">
            {t("tm.admin.int.slug", { slug: data.slug })} · <a href={address} className="text-primary hover:underline">{t("tm.admin.int.docs")}</a>
          </p>
        )}
      </Panel>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label={t("tm.admin.int.monthReads")} value={data?.monthReads ?? "–"} />
        <StatTile label={t("tm.admin.int.apps")} value={data?.apps.length ?? "–"} />
      </div>
      <Panel title={t("tm.admin.int.appsTitle")} hint={t("tm.admin.int.appsHint")}>
        {data && data.apps.length === 0 && <p className="text-small text-text-muted">{t("tm.admin.int.noApps")}</p>}
        <ul className="divide-y divide-border-soft">
          {(data?.apps ?? []).map((app) => (
            <li key={`${app.userId}-${app.tokenId ?? app.via}`}>
              <PersonRow
                name={app.name}
                sub={`${app.userName} · ${t("tm.admin.int.reads", { count: app.reads })} · ${formatRelativeTime(app.lastDay, language)}`}
                right={
                  <Button
                    type="button"
                    size="sm"
                    variant={app.blocked ? "outline" : "ghost"}
                    onClick={() => void setApiBlock(ctx.team.id, app.userId, app.tokenId, !app.blocked).then(() => setTick((n) => n + 1), (e: TeamActionError) => show(e.message))}
                  >
                    {t(app.blocked ? "tm.admin.int.unblock" : "tm.admin.int.block")}
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      </Panel>
      {node}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const AUDIT_CATEGORIES = ["all", "member", "role", "access", "approval", "library", "channel", "policy", "integration"] as const;

function AuditSection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const [category, setCategory] = useState<(typeof AUDIT_CATEGORIES)[number]>("all");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [entries, setEntries] = useState<TeamAuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4" data-testid="team-audit">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label={t("tm.admin.audit.total")} value={stats?.total ?? "–"} />
        <StatTile label={t("tm.admin.audit.roleAccess")} value={stats?.roleAccess ?? "–"} />
        <StatTile label={t("tm.admin.audit.deletes")} value={stats?.deletes ?? "–"} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PillChoice
          ariaLabel={t("tm.admin.audit.category")}
          value={category}
          onChange={setCategory}
          options={AUDIT_CATEGORIES.map((key) => ({ key, label: t(`tm.admin.audit.cat.${key}` as "tm.admin.audit.cat.all") }))}
        />
        <select value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)} aria-label={t("tm.panel.range")} className="h-9 rounded-lg border border-border bg-background px-2 text-small">
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              {t("tm.panel.days", { count: d })}
            </option>
          ))}
        </select>
      </div>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      <ul className="divide-y divide-border-soft rounded-lg border border-border-soft bg-surface px-4">
        {entries.length === 0 && !error && <li className="py-6 text-center text-small text-text-muted">{t("tm.admin.audit.empty")}</li>}
        {entries.map((entry) => (
          <li key={entry.id} className="py-2.5 text-small">
            <span className="font-medium">{entry.actorName || entry.actorUsername || t("tm.admin.audit.system")}</span>{" "}
            <span className="text-text-secondary">{t(`tm.audit.action.${entry.action}` as "tm.audit.action.member_removed")}</span>
            {entry.targetLabel && <span> · {entry.targetLabel}</span>}
            <span className="block text-caption text-text-muted">{formatRelativeTime(entry.createdAt, language)}</span>
          </li>
        ))}
      </ul>
      {more && <LoadMoreButton onLoadMore={() => void loadMore()} label={t("common.loadMore")} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
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
