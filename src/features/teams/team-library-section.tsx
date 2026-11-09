"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { BookOpen } from "@/components/icons/book-open";
import { Check } from "@/components/icons/check";
import { Clock } from "@/components/icons/clock";
import { Plus } from "@/components/icons/plus";
import { Search } from "@/components/icons/search";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldLabelClassName } from "@/components/ui/field";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useToast } from "@/features/groups/use-toast";
import { ItemVersionsModal, useLibraryVariables } from "@/features/spaces/library-parts";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { planLibraryFill } from "@/lib/space-library";
import { spaceHref } from "@/lib/spaces";
import { restoreItemVersion } from "@/lib/supabase/spaces";
import {
  fetchLibraryCounts,
  fetchLibraryItemBody,
  fetchMySpaceLevels,
  listLibraryItems,
  listTeamLibraries,
  setProjectApprovals,
  recordItemUse,
  requestReview,
  setItemDeprecated,
  setReviewSample,
  type TeamActionError,
  type TeamLibraryCounts,
  type TeamLibraryItem,
  type TeamLibraryRef,
} from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { cn, formatRelativeTime } from "@/lib/utils";
import { TeamReviewPage } from "./team-review-page";
import type { TeamCtx } from "./team-page";
import { PillChoice, waitingText } from "./team-ui";

type Status = "all" | "approved" | "pending" | "draft" | "deprecated";
const STATUSES: readonly Status[] = ["all", "approved", "pending", "draft", "deprecated"];

const STATE_KEY: Record<TeamLibraryItem["state"], TranslationKey> = {
  draft: "tm.lib.state.draft",
  pending: "tm.lib.state.pending",
  approved: "tm.lib.state.approved",
  deprecated: "tm.lib.state.deprecated",
};
const STATE_TONE: Record<TeamLibraryItem["state"], string> = {
  draft: "bg-surface-soft text-text-secondary",
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  deprecated: "bg-danger/10 text-danger",
};

/** "Elif Kaya" → "Elif K." (mockup tablosu). */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase()}.`;
}

function StateChip({ state, className }: { state: TeamLibraryItem["state"]; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-caption font-bold", STATE_TONE[state], className)}>
      {state === "approved" && <Check size={12} aria-hidden />}
      {t(STATE_KEY[state])}
    </span>
  );
}

/** Prompt metni: `{değişken}` jetonları turuncu (mockup 3). */
export function TokenText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn("prompt-text whitespace-pre-wrap break-words rounded-xl bg-surface-soft px-3.5 py-3 text-small leading-relaxed", className)}>
      {text.split(/(\{[^{}\s]+\})/g).map((part, index) =>
        /^\{[^{}\s]+\}$/.test(part) ? (
          <span key={index} className="text-secondary">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

/**
 * Kütüphane sekmesi (mockup 3 / P3–P4): üstte onay bekleyen şeridi, durum çipleri, tablo (Prompt · Durum · Sürüm · Kullanım · Güncelleyen) ve sağda
 * seçili promptun ayrıntı paneli (metin, ekip değişkenleri, Doldur ve kopyala, Sürümler, Düzenle, "Çalıştı mı?"). Telefonda ayrıntı ayrı sayfadır (`?item=`).
 * `?review=<öğe>` onay incelemesini tam sayfa açar (mockup 11). Onay kuralları sunucudadır (`space_decide_item`).
 */
export function TeamLibrarySection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { team } = ctx;
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("status");
  const [status, setStatus] = useState<Status>(STATUSES.includes(initial as Status) ? (initial as Status) : "all");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState<TeamLibraryCounts | null>(null);
  const [version, setVersion] = useState(0);
  const reviewId = params.get("review");
  const itemParam = params.get("item");
  // Kütüphane seçici (docs/history/360-*): ekip kütüphanesi + okuyabildiğim proje kütüphaneleri. Seçim `?library=` ile adreste tutulur.
  const libParam = params.get("library");
  const [libraries, setLibraries] = useState<TeamLibraryRef[]>([]);
  const [levelInfo, setLevelInfo] = useState<{ space: string; level: string | null } | null>(null);
  const activeRef = libraries.find((lib) => lib.id === libParam) ?? null;
  const libraryId = activeRef?.id ?? team.librarySpaceId;
  const isProjectLibrary = Boolean(activeRef && !activeRef.isMain);
  const spaceArg = isProjectLibrary ? activeRef!.id : null;

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);
  useEffect(() => {
    void listTeamLibraries(team.id).then(setLibraries, () => setLibraries([]));
  }, [team.id, version]);
  useEffect(() => {
    if (!spaceArg) return;
    void fetchMySpaceLevels(team.id).then(
      (levels) => setLevelInfo({ space: spaceArg, level: levels.get(spaceArg) ?? null }),
      () => setLevelInfo({ space: spaceArg, level: null }),
    );
  }, [team.id, spaceArg]);
  const myLevel = levelInfo && levelInfo.space === spaceArg ? levelInfo.level : null;
  useEffect(() => {
    void fetchLibraryCounts(team.id, spaceArg).then(setCounts, () => setCounts(null));
  }, [team.id, spaceArg, version]);

  const list = usePagedList<TeamLibraryItem>(`team-lib|${team.id}|${spaceArg ?? "main"}|${status}|${query}|${version}`, true, (offset) =>
    listLibraryItems(team.id, status === "all" ? null : status, query, offset, spaceArg),
  );
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const open = (id: string | null) => router.replace(teamLink(team.id, "library", { item: id, status: status === "all" ? null : status, library: spaceArg }));
  const switchLibrary = (id: string) => router.replace(teamLink(team.id, "library", { library: id === team.librarySpaceId ? null : id }));

  // Masaüstünde seçim yoksa ilk satır seçili görünür; telefonda ayrıntı yalnız `?item=` ile açılır.
  const selected = list.items.find((item) => item.id === itemParam) ?? null;
  const shown = selected ?? list.items[0] ?? null;

  if (reviewId) return <TeamReviewPage ctx={ctx} itemId={reviewId} onDone={refresh} libraryId={libraryId} libraryParam={spaceArg} />;

  const pendingBanner =
    counts && counts.pending > 0 ? (
      <div className="flex items-center gap-3 rounded-2xl bg-warning/10 px-4 py-3" data-lib-pending-banner>
        <Clock size={19} className="shrink-0 text-warning" aria-hidden />
        <p className="min-w-0 flex-1 text-small text-text">
          <strong className="font-bold">{t("tm.lib.pendingBanner", { count: counts.pending })}</strong>
          {counts.oldestPendingAt ? ` ${t("tm.lib.oldest", { time: formatRelativeTime(counts.oldestPendingAt, language) })}` : ""}
        </p>
        <Button type="button" size="sm" className="bg-warning text-white hover:bg-warning/90" onClick={() => setStatus("pending")} data-lib-pending-open>
          {t("tm.lib.review")}
        </Button>
      </div>
    ) : null;

  return (
    <section className="space-y-4" data-testid="team-library">
      {/* Telefonda ayrıntı sayfası (P4): kendi üst çubuğu + sabit alt düğmeler. */}
      {selected && (
        <div className="md:hidden" data-lib-phone-detail>
          <LibraryDetail ctx={ctx} item={selected} onChanged={refresh} onBack={() => open(null)} phone libraryId={libraryId} libraryParam={spaceArg} />
        </div>
      )}

      <div className={cn("space-y-4", selected && "max-md:hidden")}>
        <div className="flex items-center gap-2 md:hidden">
          {ctx.sectionMenu}
          <button type="button" onClick={() => setSearchOpen((o) => !o)} aria-label={t("header.searchAriaLabel")} aria-pressed={searchOpen} className="ml-auto grid h-11 w-11 place-items-center rounded-full bg-surface-soft text-text-secondary">
            <Search size={18} aria-hidden />
          </button>
          {libraryId && (
            <Link href={spaceHref(libraryId, "prompts")} aria-label={t("tm.lib.openSpace")} className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
              <Plus size={20} aria-hidden />
            </Link>
          )}
        </div>
        {libraries.length > 1 && (
          <PillChoice<string>
            ariaLabel={t("tm.lib.switcher")}
            value={libraryId ?? ""}
            onChange={switchLibrary}
            options={libraries.map((lib) => ({
              key: lib.id,
              label: `${lib.isMain ? t("tm.lib.main") : (lib.projectTitle ?? lib.title)}${lib.pendingCount > 0 ? ` · ${lib.pendingCount}` : ""}`,
            }))}
          />
        )}
        {isProjectLibrary && activeRef && (
          <ProjectLibraryBar
            library={activeRef}
            canManage={myLevel === "manage"}
            onChanged={refresh}
            projectHref={activeRef.projectId ? spaceHref(activeRef.projectId) : null}
          />
        )}
        {pendingBanner}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <PillChoice<Status>
                  ariaLabel={t("tm.lib.filter")}
                  value={status}
                  onChange={setStatus}
                  options={STATUSES.map((key) => ({ key, label: `${key === "all" ? t("tm.lib.all") : t(STATE_KEY[key])}${counts ? ` ${key === "all" ? counts.total : counts[key]}` : ""}` }))}
                />
              </div>
              <button type="button" onClick={() => setSearchOpen((o) => !o)} aria-label={t("header.searchAriaLabel")} aria-pressed={searchOpen} data-lib-search className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary hover:text-text max-md:hidden">
                <Search size={17} aria-hidden />
              </button>
            </div>
            {searchOpen && (
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("tm.lib.search")} aria-label={t("tm.lib.search")} autoFocus className="h-11 w-full rounded-full border border-border bg-surface px-4 text-small" />
            )}

            <PagedListState list={list}>
              {list.items.length === 0 && !list.failed ? (
                <EmptyState icon={BookOpen} title={t("tm.lib.empty.title")} description={t("tm.lib.empty.body")} action={libraryId ? { label: t("tm.lib.openSpace"), href: spaceHref(libraryId, "prompts") } : undefined} />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border-soft bg-surface max-md:border-0 max-md:bg-transparent" data-testid="team-library-list">
                  <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_3.5rem_5rem_6.5rem] gap-3 border-b border-border-soft px-4 py-2.5 text-caption font-bold uppercase tracking-[0.06em] text-text-muted max-md:hidden">
                    <span>{t("tm.lib.col.prompt")}</span>
                    <span>{t("tm.lib.col.state")}</span>
                    <span>{t("tm.lib.col.version")}</span>
                    <span>{t("tm.lib.col.uses")}</span>
                    <span>{t("tm.lib.col.updatedBy")}</span>
                  </div>
                  <ul className="max-md:space-y-2.5">
                    {list.items.map((item) => {
                      const active = shown?.id === item.id;
                      return (
                        <li key={item.id} data-library-item={item.id} data-state={item.state}>
                          <button
                            type="button"
                            onClick={() => open(item.id)}
                            aria-current={active ? "true" : undefined}
                            className={cn(
                              "w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                              "md:grid md:grid-cols-[minmax(0,1fr)_8.5rem_3.5rem_5rem_6.5rem] md:items-center md:gap-3 md:border-b md:border-border-soft md:px-4 md:py-3 md:last:border-b-0",
                              "max-md:flex max-md:items-center max-md:gap-3 max-md:rounded-2xl max-md:border max-md:border-border-soft max-md:bg-surface max-md:p-3.5",
                              active ? "md:bg-primary-soft/60" : "md:hover:bg-surface-soft",
                            )}
                          >
                            <span className="min-w-0 max-md:flex-1">
                              <span className="block truncate text-small font-semibold text-text max-md:text-body">{item.title}</span>
                              <span className="mt-0.5 block truncate text-caption text-text-muted md:hidden">
                                {[`v${item.contentRev}`, item.state === "approved" || item.state === "deprecated" ? t("tm.lib.copies", { count: item.useCount }) : item.state === "pending" ? waitingText(t, item.reviewRequestedAt) : null, shortName(item.updatedByName)].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className="max-md:shrink-0">
                              <StateChip state={item.state} />
                            </span>
                            <span className="text-small text-text-secondary max-md:hidden">v{item.contentRev}</span>
                            <span className="text-small text-text-secondary max-md:hidden">{item.useCount > 0 ? item.useCount : "—"}</span>
                            <span className="truncate text-small text-text-secondary max-md:hidden">{shortName(item.updatedByName)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </PagedListState>
          </div>
          <aside className="sticky top-4 max-lg:hidden" data-lib-detail>
            {shown ? <LibraryDetail ctx={ctx} item={shown} onChanged={refresh} libraryId={libraryId} libraryParam={spaceArg} /> : null}
          </aside>
        </div>
      </div>
    </section>
  );
}

/** Proje kütüphanesi çubuğu: projeye bağlantı ve (projede `manage` ise) gereken onay sayısı. Karar sunucudadır (`space_set_project_approvals`). */
function ProjectLibraryBar({ library, canManage, onChanged, projectHref }: { library: TeamLibraryRef; canManage: boolean; onChanged: () => void; projectHref: string | null }) {
  const { t } = useTranslation();
  const { node, show } = useToast();
  const [busy, setBusy] = useState(false);
  const value = library.approvalsCustom ? String(library.approvalsNeeded) : "team";
  const change = async (next: string) => {
    setBusy(true);
    try {
      await setProjectApprovals(library.id, next === "team" ? null : Number(next));
      show(t("tm.lib.approvalsSaved"));
      onChanged();
    } catch (e) {
      show((e as TeamActionError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border-soft bg-surface px-3.5 py-2.5" data-project-library-bar>
      <p className="min-w-0 flex-1 text-small text-text-secondary">
        {t("tm.lib.projectNote")}
        {projectHref && (
          <>
            {" "}
            <Link href={projectHref} className="font-semibold text-primary hover:underline">
              {library.projectTitle}
            </Link>
          </>
        )}
      </p>
      <label className="flex items-center gap-2 text-small text-text-secondary">
        {t("tm.lib.approvalsNeeded")}
        <select
          value={value}
          disabled={!canManage || busy}
          onChange={(event) => void change(event.target.value)}
          aria-label={t("tm.lib.approvalsNeeded")}
          data-project-approvals
          className="h-8 rounded-lg border border-border bg-background px-2 text-caption disabled:opacity-60"
        >
          <option value="team">{t("tm.lib.approvalsTeamValue")}</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>
      {node}
    </div>
  );
}

/** Seçili promptun ayrıntısı (sağ panel / telefonda tam sayfa): metin, ekip değişkenleri, kopyalama, sürümler, düzenleme ve onay işleri. */
function LibraryDetail({
  ctx,
  item,
  onChanged,
  onBack,
  phone = false,
  libraryId,
  libraryParam,
}: {
  ctx: TeamCtx;
  item: TeamLibraryItem;
  onChanged: () => void;
  onBack?: () => void;
  phone?: boolean;
  /** Seçili kütüphanenin Space kimliği (ekip kütüphanesi ya da proje kütüphanesi). */
  libraryId: string | null;
  /** `?library=` değeri: yalnız proje kütüphanesinde dolu. */
  libraryParam: string | null;
}) {
  const { t, language } = useTranslation();
  const { team, can } = ctx;
  const router = useRouter();
  const { node: toastNode, show } = useToast();
  const [body, setBody] = useState<string | null>(null);
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [sampleFor, setSampleFor] = useState(false);
  const library = useLibraryVariables(libraryId ?? "", Boolean(libraryId));

  // Telefonda ayrıntı tam ekran sayfadır: alt menü açıkken sabit düğmelerin üstünü örter (`html[data-fullscreen-detail]`, globals.css).
  useEffect(() => {
    if (!phone) return;
    const root = document.documentElement;
    root.setAttribute("data-fullscreen-detail", "");
    return () => root.removeAttribute("data-fullscreen-detail");
  }, [phone]);

  useEffect(() => {
    let alive = true;
    void fetchLibraryItemBody(item.id).then(
      (row) => alive && setBody(row?.body ?? ""),
      () => alive && setBody(""),
    );
    return () => {
      alive = false;
    };
  }, [item.id, item.contentRev]);

  const plan = useMemo(() => planLibraryFill(body ?? "", library.shared, entered), [body, library.shared, entered]);
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      show(done);
      onChanged();
    } catch (error) {
      show((error as TeamActionError).message);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plan.text);
      show(t("tm.lib.copied"));
      if (item.state === "approved") void recordItemUse(item.id).catch(() => undefined);
    } catch {
      show(t("tm.error.generic"));
    }
  };
  const total = item.worksYes + item.worksNo;
  const percent = total > 0 ? Math.round((item.worksYes / total) * 100) : null;
  const subtitle =
    item.state === "approved"
      ? t("tm.lib.sub.approved", { name: shortName(item.updatedByName), rev: item.contentRev, time: formatRelativeTime(item.approvedAt ?? item.updatedAt, language) })
      : item.state === "pending"
        ? t("tm.lib.sub.pending", { name: shortName(item.updatedByName), time: formatRelativeTime(item.reviewRequestedAt ?? item.updatedAt, language) })
        : t("tm.lib.sub.other", { name: shortName(item.updatedByName), rev: item.contentRev, time: formatRelativeTime(item.updatedAt, language) });
  const openSpace = libraryId ? spaceHref(libraryId, "prompts") : null;

  const actions = (
    <div className="space-y-2.5">
      {item.state === "pending" && (
        <Link href={teamLink(team.id, "library", { review: item.id, library: libraryParam })} className={buttonClassName({ size: "lg", className: "w-full" })} data-review-open>
          {t("tm.lib.review")}
        </Link>
      )}
      {(item.state === "approved" || item.state === "draft") && (
        <Button type="button" size="lg" className="w-full" onClick={() => void copy()} disabled={body === null} data-lib-copy>
          {t("tm.lib.fillCopy")}
        </Button>
      )}
      {item.state === "draft" && can("create_spaces") && (
        <Button type="button" size="lg" variant="outline" className="w-full" onClick={() => setSampleFor(true)}>
          {t("tm.lib.requestReview")}
        </Button>
      )}
      {item.state === "pending" && can("create_spaces") && (
        <Button type="button" variant="outline" className="w-full" onClick={() => void act(() => requestReview(item.id, true), t("tm.lib.withdrawn"))}>
          {t("tm.lib.withdraw")}
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="outline" size="lg" onClick={() => setVersionsOpen(true)}>
          {t("tm.lib.versions")}
        </Button>
        {openSpace ? (
          <Link href={openSpace} className={buttonClassName({ variant: "outline", size: "lg" })}>
            {t("tm.lib.edit")}
          </Link>
        ) : (
          <span />
        )}
      </div>
      {can("approve_library") && item.state === "approved" && (
        <button type="button" onClick={() => void act(() => setItemDeprecated(item.id, true), t("tm.lib.deprecated"))} className="w-full text-center text-caption font-medium text-text-muted hover:text-danger">
          {t("tm.lib.deprecate")}
        </button>
      )}
      {can("approve_library") && item.state === "deprecated" && (
        <button type="button" onClick={() => void act(() => setItemDeprecated(item.id, false), t("tm.lib.restored"))} className="w-full text-center text-caption font-medium text-primary hover:underline">
          {t("tm.lib.restore")}
        </button>
      )}
    </div>
  );

  return (
    <div className={cn(phone ? "fixed inset-0 z-40 flex flex-col bg-background" : "rounded-2xl border border-border-soft bg-surface p-4")} data-lib-detail-card>
      {phone && (
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border-soft bg-surface px-2">
          <button type="button" onClick={onBack} aria-label={t("common.back")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-soft">
            <ArrowLeft size={20} aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate text-small font-semibold text-text-secondary">{t("tm.lib.crumb", { team: team.name })}</span>
        </div>
      )}
      <div className={cn(phone ? "min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-4" : "space-y-4")}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words font-display text-h3 font-bold leading-tight text-text">{item.title}</h2>
          <StateChip state={item.state} className="shrink-0" />
        </div>
        <p className="-mt-2 text-caption text-text-muted">{subtitle}</p>
        {body === null ? <p className="text-small text-text-muted">{t("common.loading")}</p> : body ? <TokenText text={body} /> : null}

        {plan.tokens.length > 0 && (
          <div className="space-y-2">
            <p className={cn(fieldLabelClassName, "!mb-1 text-caption font-bold uppercase tracking-[0.06em] text-text-muted")}>{t("tm.lib.variables")}</p>
            {plan.tokens.map((name) => {
              const shared = library.shared[name];
              return (
                <div key={name} className="flex items-center gap-3 rounded-xl border border-border-soft px-3 py-2.5" data-lib-variable={name}>
                  <code className="prompt-text w-24 shrink-0 truncate text-small text-secondary">{name}</code>
                  {shared ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-small text-text">{shared}</span>
                      <span className="text-caption font-bold uppercase text-text-muted">{t("tm.lib.var.team")}</span>
                    </>
                  ) : (
                    <>
                      <input
                        value={entered[name] ?? ""}
                        onChange={(event) => setEntered((prev) => ({ ...prev, [name]: event.target.value }))}
                        placeholder={t("tm.lib.var.fill")}
                        aria-label={name}
                        className="min-w-0 flex-1 bg-transparent text-small text-text outline-none placeholder:text-text-muted"
                      />
                      <span className="text-caption font-bold uppercase text-text-muted">{t("tm.lib.var.you")}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {percent !== null && (
          <div>
            <div className="flex items-baseline justify-between text-caption text-text-secondary">
              <span>
                {t("tm.lib.worksLabel")} <strong className="font-bold text-text">%{percent}</strong>
              </span>
              <span>{t("tm.lib.votes", { count: total })}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-soft">
              <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
        {!phone && actions}
      </div>
      {phone && <div className="shrink-0 border-t border-border-soft bg-surface px-4 py-3">{actions}</div>}

      {versionsOpen && (
        <ItemVersionsModal
          itemId={item.id}
          itemTitle={item.title}
          canRestore={can("create_spaces")}
          onRestore={async (version) => {
            await restoreItemVersion(version.id);
            setVersionsOpen(false);
            onChanged();
          }}
          onClose={() => setVersionsOpen(false)}
        />
      )}
      {sampleFor && (
        <RequestReviewDialog
          item={item}
          onClose={() => setSampleFor(false)}
          onDone={() => {
            setSampleFor(false);
            show(t("tm.lib.requested"));
            onChanged();
            router.refresh();
          }}
        />
      )}
      {toastNode}
    </div>
  );
}

/** "Onaya gönder": isteğe bağlı örnek çıktı (satır başına bir örnek) ile birlikte (mockup 11'deki "Örnek çıktı"). */
function RequestReviewDialog({ item, onClose, onDone }: { item: TeamLibraryItem; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (sample.trim()) await setReviewSample(item.id, sample.trim());
      await requestReview(item.id);
      onDone();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t("tm.lib.requestReviewTitle", { title: item.title })}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-request-review"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("tm.lib.requestReview")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabelClassName}>{t("tm.lib.sample")}</span>
          <textarea value={sample} onChange={(event) => setSample(event.target.value)} maxLength={2000} rows={5} placeholder={t("tm.lib.samplePlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-small" />
        </label>
        <p className="text-caption text-text-muted">{t("tm.lib.sampleHint")}</p>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}
