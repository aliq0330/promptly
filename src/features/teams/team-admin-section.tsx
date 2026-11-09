"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Download } from "@/components/icons/download";
import { History } from "@/components/icons/history";
import { Info } from "@/components/icons/info";
import { ShieldCheck } from "@/components/icons/shield-check";
import { TriangleAlert } from "@/components/icons/triangle-alert";
import { UserPlus } from "@/components/icons/user-plus";
import { UserRound } from "@/components/icons/user-round";
import { Users } from "@/components/icons/users";
import { PhoneSectionList, PhoneSubBar, type PhoneSectionItem } from "@/features/content/phone-sections";
import { useMediaQuery } from "@/lib/use-media-query";
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
  listAudit,
  listTeamMembers,
  transferOwnership,
  updateTeam,
  type TeamActionError,
  type TeamAuditEntry,
  type TeamMember,
  type TeamPolicy,
} from "@/lib/supabase/teams";
import { teamLink, type TeamRole } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { AdminGroupsSection, AdminGuestsSection } from "./team-admin-access";
import { InvitesPanel } from "./team-invites";
import type { TeamCtx } from "./team-page";
import { Panel, StatTile, TEAM_TONES, TeamMark, roleLabelKey } from "./team-ui";

type Section = "general" | "policies" | "invites" | "groups" | "guests" | "audit" | "export" | "danger";

/** Yönetim sekmesi: yetenek başına görünen bölümler (gizlemek yalnız görünümdür, her işlem sunucuda yeniden denetlenir). */
export function TeamAdminSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, can } = ctx;
  const router = useRouter();
  const params = useSearchParams();

  const items: SectionMenuItem<Section>[] = useMemo(() => {
    const list: SectionMenuItem<Section>[] = [];
    if (can("manage_team")) list.push({ key: "general", label: t("tm.admin.general") }, { key: "policies", label: t("tm.admin.policies") });
    if (can("manage_members")) list.push({ key: "invites", label: t("tm.admin.invites") });
    if (can("manage_groups")) list.push({ key: "groups", label: t("tm.admin.groups") });
    if (can("manage_members")) list.push({ key: "guests", label: t("tm.admin.guests") });
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
      case "groups":
        return <AdminGroupsSection ctx={ctx} />;
      case "guests":
        return <AdminGuestsSection ctx={ctx} />;
      case "audit":
        return <AuditSection ctx={ctx} />;
      case "export":
        return <ExportSection ctx={ctx} />;
      default:
        return <DangerSection ctx={ctx} />;
    }
  })();

  const go = (key: Section) => router.replace(teamLink(team.id, "admin", { section: key }));
  const phone = useMediaQuery("(max-width: 767.98px)");

  // Telefon (docs/history/357-*, Yön C): Yönetim bir bölüm LİSTESİDİR; satır alt sayfayı açar, alt sayfa kendi geri çubuğunu çizer.
  if (phone) {
    const ICONS: Record<Section, PhoneSectionItem["icon"]> = {
      general: Info,
      policies: ShieldCheck,
      invites: UserPlus,
      groups: Users,
      guests: UserRound,
      audit: History,
      export: Download,
      danger: TriangleAlert,
    };
    const chosen = items.find((item) => item.key === raw)?.key ?? null;
    if (!chosen) {
      return (
        <section data-testid="team-admin" data-phone-admin-list>
          <div data-team-phone-bar>
            <PhoneSubBar parent={team.name} title={t("tm.tab.admin")} backHref={teamLink(team.id)} />
          </div>
          <PhoneSectionList
            ariaLabel={t("tm.admin.aria")}
            items={items.map((item) => ({ key: item.key, label: item.label, href: teamLink(team.id, "admin", { section: item.key }), icon: ICONS[item.key], danger: item.key === "danger" }))}
          />
        </section>
      );
    }
    return (
      <section data-testid="team-admin">
        <div data-team-phone-bar>
          <PhoneSubBar parent={`${team.name} · ${t("tm.tab.admin")}`} title={items.find((item) => item.key === chosen)?.label ?? ""} backHref={teamLink(team.id, "admin")} />
        </div>
        <div className="min-w-0 space-y-4">{body}</div>
      </section>
    );
  }

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
      <div className="min-w-0 space-y-4">{body}</div>
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
  const num = (key: "inviteLinkTtlDays") => String(value(key));
  const roleOptions = <R extends "owner" | "admin" | "editor">(keys: R[]) => keys.map((key) => ({ key, label: t(`tm.role.${key}` as "tm.role.owner") }));
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
      <div className="flex items-center gap-2 md:flex-wrap">
        <h2 className="mr-auto font-display text-h2 font-bold max-md:hidden">{t("tm.admin.audit")}</h2>
        <SectionMenu items={categoryItems} active={category} onChange={setCategory} ariaLabel={t("tm.admin.audit.category")} title={t("tm.admin.audit.category")} align="end" />
        <SectionMenu items={dayItems} active={String(days) as "7" | "30" | "90"} onChange={(key) => setDays(Number(key) as 7 | 30 | 90)} ariaLabel={t("tm.panel.range")} title={t("tm.panel.range")} align="end" />
        <Button type="button" variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={exporting} data-audit-csv>
          <span className="max-md:hidden">{t("tm.audit.csv")}</span>
          <span className="md:hidden">CSV</span>
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
