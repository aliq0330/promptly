"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { Lock } from "@/components/icons/lock";
import { Plus } from "@/components/icons/plus";
import { Search } from "@/components/icons/search";
import { Shapes } from "@/components/icons/shapes";
import { User } from "@/components/icons/user";
import { Users } from "@/components/icons/users";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionMenu } from "@/features/content/section-menu";
import { fieldLabelClassName } from "@/components/ui/field";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { DescriptionField, FormError, KindField, SubmitButton, TemplateField, TitleField } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KIND_LABEL, SPACE_KINDS, SPACE_TEMPLATE_GROUPS, spaceHref, type SpaceKind } from "@/lib/spaces";
import { createTeamSpace, fetchLibraryCounts, fetchSpaceAccess, listTeamSpaces, setSpaceAccess, type AccessEntry, type TeamActionError, type TeamLibraryCounts, type TeamSpaceRow } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { cn, formatRelativeTime } from "@/lib/utils";
import { AccessEditor } from "./access-editor";
import type { TeamCtx } from "./team-page";
import { PillChoice } from "./team-ui";

const CREATE_KINDS: readonly SpaceKind[] = SPACE_KINDS.filter((kind) => kind !== "team_library");

type AccessMode = "all" | "selected" | "admins";

/** Pastel kapak tonları (mockup 2 / P2): her Space kimliğine göre sabit bir ton; ekip kütüphanesi hep mavi. */
const SPACE_TONES = [
  { bg: "bg-primary-soft", mid: "bg-primary/25" },
  { bg: "bg-secondary/10", mid: "bg-secondary/25" },
  { bg: "bg-success/10", mid: "bg-success/25" },
  { bg: "bg-text-secondary/10", mid: "bg-text-secondary/25" },
  { bg: "bg-primary/10", mid: "bg-primary/30" },
  { bg: "bg-surface-soft", mid: "bg-border-strong" },
] as const;

const toneFor = (space: Pick<TeamSpaceRow, "id" | "isLibrary">) => (space.isLibrary ? SPACE_TONES[0] : SPACE_TONES[[...space.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % SPACE_TONES.length]);

function MiniArt({ tone, className }: { tone: (typeof SPACE_TONES)[number]; className?: string }) {
  return (
    <span aria-hidden className={cn("relative flex shrink-0 items-end justify-center gap-[3%] overflow-hidden px-[6%]", tone.bg, className)}>
      <span className="mb-3.5 h-[34%] w-[28%] rounded-md bg-surface" />
      <span className={cn("mb-3.5 h-[58%] w-[24%] rounded-md", tone.mid)} />
      <span className="mb-3.5 h-[40%] w-[28%] rounded-md bg-surface" />
    </span>
  );
}

function Chip({ tone = "plain", icon: Icon, children }: { tone?: "plain" | "info" | "ok" | "warn" | "danger"; icon?: IconComponent; children: React.ReactNode }) {
  const toneClass = { plain: "bg-surface-soft text-text-secondary", info: "bg-primary-soft text-primary", ok: "bg-success/10 text-success", warn: "bg-warning/10 text-warning", danger: "bg-danger/10 text-danger" }[tone];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-caption font-semibold", toneClass)}>
      {Icon && <Icon size={12} aria-hidden />}
      {children}
    </span>
  );
}

type SpaceFilter = "all" | "team" | "selected" | "admins";

/** Space'ler sekmesi (mockup 2 / P2): kontrol satırı (filtre · arama · N / 50 · Yeni Space) ve pastel kapaklı kartlar. Erişim penceresi Yönetim → Space erişimi'ndedir. */
export function TeamSpacesSection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { team, can } = ctx;
  const [createOpen, setCreateOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<SpaceFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState<TeamLibraryCounts | null>(null);
  const list = usePagedList<TeamSpaceRow>(`team-spaces|${team.id}|${version}`, true, (offset) => listTeamSpaces(team.id, offset));
  useEffect(() => {
    if (team.myRole === "guest") return;
    void fetchLibraryCounts(team.id).then(setCounts, () => setCounts(null));
  }, [team.id, team.myRole, version]);

  const needle = query.trim().toLocaleLowerCase();
  const visible = list.items
    .filter((space) => (filter === "all" || (filter === "team" ? space.accessMode === "all" : space.accessMode === filter)) && (!needle || space.title.toLocaleLowerCase().includes(needle)))
    .sort((a, b) => Number(b.isLibrary) - Number(a.isLibrary));
  const filterItems: { key: SpaceFilter; label: string }[] = [
    { key: "all", label: t("common.all") },
    { key: "team", label: t("tm.access.mode.all") },
    { key: "selected", label: t("tm.access.mode.selected") },
    { key: "admins", label: t("tm.access.mode.admins") },
  ];
  const newButton = can("create_spaces") ? (
    <Button type="button" onClick={() => setCreateOpen(true)} data-team-new-space className="max-md:hidden">
      <Plus size={16} aria-hidden />
      {t("tm.spaces.new")}
    </Button>
  ) : null;

  return (
    <section className="space-y-4" data-testid="team-spaces">
      <div className="flex items-center gap-2" data-spaces-controls>
        <div className="md:hidden">{ctx.sectionMenu}</div>
        <div className="max-md:hidden">
          <SectionMenu items={filterItems} active={filter} onChange={setFilter} ariaLabel={t("tm.spaces.filter")} title={t("tm.spaces.filter")} />
        </div>
        <button type="button" onClick={() => setSearchOpen((open) => !open)} aria-label={t("header.searchAriaLabel")} aria-pressed={searchOpen} data-spaces-search className="grid h-11 w-11 place-items-center rounded-full bg-surface-soft text-text-secondary hover:text-text max-md:ml-auto">
          <Search size={18} aria-hidden />
        </button>
        <span className="ml-auto text-small text-text-muted max-md:hidden" data-space-counter>
          {t("tm.spaces.counter", { count: team.spaceCount })}
        </span>
        {newButton}
        {can("create_spaces") && (
          <button type="button" onClick={() => setCreateOpen(true)} aria-label={t("tm.spaces.new")} data-team-new-space-phone className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground md:hidden">
            <Plus size={20} aria-hidden />
          </button>
        )}
      </div>
      {searchOpen && (
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("tm.spaces.searchPlaceholder")} aria-label={t("header.searchAriaLabel")} autoFocus className="h-11 w-full rounded-full border border-border bg-surface px-4 text-small" />
      )}

      <PagedListState list={list}>
        {visible.length === 0 && !list.failed ? (
          <EmptyState icon={Shapes} title={t("tm.spaces.empty.title")} description={t("tm.spaces.empty.body")} action={can("create_spaces") ? { label: t("tm.spaces.new"), onClick: () => setCreateOpen(true) } : undefined} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {visible.map((space) => {
              const tone = toneFor(space);
              const href = space.isLibrary ? teamLink(team.id, "library") : spaceHref(space.id);
              const items = space.imageCount + space.promptCount + space.noteCount;
              const time = formatRelativeTime(space.updatedAt, language);
              const audience =
                space.accessMode === "all" ? (
                  <Chip tone="ok" icon={Users}>
                    {t("tm.access.mode.all")}
                  </Chip>
                ) : space.accessMode === "admins" ? (
                  <Chip tone="danger" icon={Lock}>
                    {t("tm.spaces.adminsOnly")}
                  </Chip>
                ) : space.guestCount > 0 ? (
                  <Chip tone="warn" icon={User}>
                    {t("tm.spaces.people", { count: space.memberCount })} + {t("tm.spaces.guests", { count: space.guestCount })}
                  </Chip>
                ) : (
                  <Chip icon={Users}>{t("tm.spaces.people", { count: space.memberCount })}</Chip>
                );
              return (
                <li key={space.id} data-space-card={space.id} className={cn("overflow-hidden rounded-2xl border bg-surface", space.isLibrary ? "border-2 border-primary" : "border-border-soft")}>
                  <Link href={href} className="flex gap-3 p-2.5 md:flex-col md:gap-0 md:p-0">
                    <MiniArt tone={tone} className="h-[76px] w-[76px] rounded-xl md:h-[104px] md:w-full md:rounded-none" />
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-2 md:p-4">
                      <span className="truncate font-display text-[1.0625rem] font-bold leading-tight text-text">{space.isLibrary ? t("tm.spaces.library") : space.title}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {space.isLibrary ? (
                          <>
                            <Chip tone="info">{t("tm.spaces.libraryChip")}</Chip>
                            {counts && counts.pending > 0 && <Chip tone="warn">{t("tm.spaces.pendingChip", { count: counts.pending })}</Chip>}
                          </>
                        ) : (
                          <>
                            <Chip>{t(SPACE_KIND_LABEL[space.kind as SpaceKind] ?? "spaces.kind.free")}</Chip>
                            {audience}
                          </>
                        )}
                      </span>
                      <span className="text-small text-text-muted">
                        {space.isLibrary && counts
                          ? t("tm.spaces.libMeta", { prompts: counts.total, approved: counts.approved, audience: t(space.accessMode === "all" ? "tm.access.mode.all" : space.accessMode === "admins" ? "tm.access.mode.admins" : "tm.access.mode.selected"), time })
                          : t("tm.spaces.itemsMeta", { count: items, time })}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PagedListState>

      {createOpen && (
        <CreateSpaceDialog
          teamId={team.id}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setVersion((v) => v + 1);
            ctx.reload();
          }}
        />
      )}
    </section>
  );
}

function CreateSpaceDialog({ teamId, onClose, onCreated }: { teamId: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<SpaceKind>("moodboard");
  const [template, setTemplate] = useState<"empty" | "template">("template");
  const [mode, setMode] = useState<AccessMode>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("tm.error.space_title_required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTeamSpace(teamId, title.trim(), description.trim(), kind, template === "template" ? SPACE_TEMPLATE_GROUPS[kind].map((key) => t(key)) : [], mode);
      onCreated();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tm.spaces.new")}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={(event) => void submit(event)}
      formTestId="team-create-space-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("tm.spaces.create")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} autoFocus />
        <DescriptionField value={description} onChange={setDescription} />
        <KindField value={kind} onChange={setKind} kinds={CREATE_KINDS} />
        <TemplateField kind={kind} value={template} onChange={setTemplate} />
        <div>
          <span className={fieldLabelClassName}>{t("tm.spaces.whoSees")}</span>
          <PillChoice
            ariaLabel={t("tm.spaces.whoSees")}
            value={mode}
            onChange={setMode}
            options={[
              { key: "all", label: t("tm.access.mode.all") },
              { key: "admins", label: t("tm.access.mode.admins") },
            ]}
          />
          <p className="mt-1.5 text-caption text-text-muted">{t("tm.spaces.whoSeesHint")}</p>
        </div>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/** Space erişimi: herkes / seçilenler / yalnız yönetim; seçilenlerde kişi ve grup listesi. */
export function SpaceAccessDialog({ teamId, space, memberCount, onClose, onSaved }: { teamId: string; space: Pick<TeamSpaceRow, "id" | "title" | "accessMode">; /** "Tüm ekip" satırındaki "48 üye" için; bilinmiyorsa gösterilmez. */ memberCount?: number; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AccessMode>(space.accessMode as AccessMode);
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSpaceAccess(space.id).then(
      (data) => {
        if (cancelled) return;
        setEntries(data.entries);
        setLoaded(true);
      },
      (e: TeamActionError) => {
        if (!cancelled) setError(e.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [space.id]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setSpaceAccess(space.id, mode, mode === "selected" ? entries : []);
      onSaved();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  const choices: { key: AccessMode; title: string; hint: string }[] = [
    { key: "all", title: t("tm.access.mode.all"), hint: t("tm.access.mode.allCardHint", { count: memberCount ?? 0 }) },
    { key: "selected", title: t("tm.access.mode.selectedCard"), hint: t("tm.access.mode.selectedCardHint") },
    { key: "admins", title: t("tm.access.mode.adminsCard"), hint: t("tm.access.mode.adminsCardHint") },
  ];
  return (
    <SpaceDialog
      eyebrow={t("tm.spaces.access")}
      title={space.title}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={(event) => void save(event)}
      formTestId="team-space-access-form"
      footer={
        <>
          <p className="mr-auto max-w-[16rem] text-caption leading-snug text-text-muted max-sm:hidden">{t("tm.spaces.accessNote")}</p>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy} disabled={!loaded}>
            {t("common.save")}
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label={t("tm.spaces.whoSees")} className="space-y-2">
          {choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              role="radio"
              aria-checked={mode === choice.key}
              onClick={() => setMode(choice.key)}
              data-access-mode={choice.key}
              className={cn("flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors", mode === choice.key ? "border-primary ring-1 ring-primary" : "border-border-soft hover:bg-surface-soft")}
            >
              <span aria-hidden className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", mode === choice.key ? "border-primary" : "border-border-strong")}>
                {mode === choice.key && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0">
                <span className="block text-small font-bold text-text">{choice.title}</span>
                <span className="block text-caption text-text-secondary">{choice.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {mode === "selected" && loaded && <AccessEditor teamId={teamId} entries={entries} onChange={setEntries} variant="space" />}
        <p className="text-caption text-text-muted sm:hidden">{t("tm.spaces.accessNote")}</p>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
