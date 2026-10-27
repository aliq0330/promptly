"use client";

import { LoadMoreButton } from "@/features/feed/load-more";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Grid2x2, ImageIcon, List, ListFilter, Loader2, Mail, Plus, Search, SquareTerminal, StickyNote, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-header";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  fetchLeadPalettes,
  fetchMySpaceInvitations,
  listSpaces,
  respondSpaceInvitation,
  summaryArt,
  type MySpaceInvitation,
  type SpaceSummary,
} from "@/lib/supabase/spaces";
import { isSpaceFilter, SPACE_KIND_LABEL, SPACE_PAGE_SIZE, SPACE_ROLE_LABEL, spaceHref, type SpaceFilter, type SpaceKind, type SpaceSort, type SpaceVisibility } from "@/lib/spaces";
import { CreateSpaceModal } from "./space-modals";
import { SpaceCard } from "./space-card";
import { SectionMenu, type SectionMenuItem, CONTROL_ICON_BUTTON } from "@/features/content/section-menu";
import { SpacesFilterSheet, SpaceTemplates } from "./spaces-controls";
import { SpaceCoverArt, SpacesIcon } from "./space-visuals";

const FILTER_LABEL: Record<SpaceFilter, TranslationKey> = {
  all: "spaces.filter.all",
  mine: "spaces.filter.mine",
  shared: "spaces.filter.shared",
  favorites: "spaces.filter.favorites",
  public: "spaces.filter.public",
  archived: "spaces.filter.archived",
};

const VIEW_KEY = "promptly-spaces-view";

function readView(): "grid" | "list" {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/**
 * Spaces ana sayfası (docs/history/213-*, Albüm düzeni 214-*, sade düzen 231-*): büyük başlık; tek kontrol satırı — "Tümü ▾" bölüm menüsü
 * (Tümü · Benim · Paylaşılan · Sabitli · Herkese açık · Arşiv; bekleyen davet varsa nokta + sayaçlı "Davetler"), arama (proje adı/açıklaması +
 * içindeki görsel/prompt/not metinleri, sunucuda), filtre/sıralama sayfası, ızgara/liste anahtarı ve "+"; "Yeni bir Space başlatın" tür
 * karoları, tek satırlık davet kartı, "Son açılanlar" rafı, Albüm kartları ve kademeli yükleme. Ziyaretçi yalnız herkese açık Space'leri
 * görür; oluşturmak giriş ister.
 */
export function SpacesHome() {
  const { t, language } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter");
  const [section, setSection] = useState<SpaceFilter | "invites">(isSpaceFilter(initialFilter) ? initialFilter : "all");
  const [sort, setSort] = useState<SpaceSort>("updated");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [items, setItems] = useState<SpaceSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [recent, setRecent] = useState<SpaceSummary[]>([]);
  const [invites, setInvites] = useState<MySpaceInvitation[]>([]);
  const [palettes, setPalettes] = useState<Map<string, string[]>>(() => new Map());
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<SpaceKind | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<SpaceKind | null>(null);
  const [visibilityFilter, setVisibilityFilter] = useState<SpaceVisibility | null>(null);
  const requestId = useRef(0);
  const askedPalettes = useRef(new Set<string>());

  // Davet bölümü yalnız bekleyen davet varken vardır; son davet yanıtlanınca Tümü'ne dönülür.
  const filter: SpaceFilter = section === "invites" ? "all" : section;
  const showInvites = section === "invites" && invites.length > 0;
  // Ziyaretçi yalnız herkese açık süzgeci kullanabilir.
  const effectiveFilter: SpaceFilter = user ? filter : "public";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is read after mount (static export: no window during prerender)
    setView(readView());
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (authLoading) return;
    const id = ++requestId.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- back to the loading state for a new query; the response fills it
    setItems(null);
    setError(false);
    listSpaces({ filter: effectiveFilter, query: debounced, sort, limit: SPACE_PAGE_SIZE, offset: 0 })
      .then((list) => {
        if (id !== requestId.current) return;
        setItems(list);
        setHasMore(list.length === SPACE_PAGE_SIZE);
      })
      .catch(() => id === requestId.current && setError(true));
  }, [authLoading, effectiveFilter, debounced, sort, reloadKey]);

  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    listSpaces({ filter: "recent", sort: "opened", limit: 8 })
      .then((list) => alive && setRecent(list))
      .catch(() => alive && setRecent([]));
    fetchMySpaceInvitations()
      .then((list) => alive && setInvites(list))
      .catch(() => alive && setInvites([]));
    return () => {
      alive = false;
    };
  }, [signedIn, reloadKey]);

  // Kartların palet çizgisi: yeni gelen Space'lerin ilk paleti bir kez sorulur (sorulamazsa çizgisiz kalır).
  useEffect(() => {
    const ids = (items ?? []).map((item) => item.id).filter((id) => !askedPalettes.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => askedPalettes.current.add(id));
    fetchLeadPalettes(ids)
      .then((found) => found.size > 0 && setPalettes((current) => new Map([...current, ...found])))
      .catch(() => undefined);
  }, [items]);

  const loadMore = useCallback(async () => {
    if (!items) return;
    setLoadingMore(true);
    try {
      const next = await listSpaces({ filter: effectiveFilter, query: debounced, sort, limit: SPACE_PAGE_SIZE, offset: items.length });
      setItems((list) => [...(list ?? []), ...next.filter((n) => !(list ?? []).some((o) => o.id === n.id))]);
      setHasMore(next.length === SPACE_PAGE_SIZE);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [items, effectiveFilter, debounced, sort]);

  function changeView(next: "grid" | "list") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Tercih yalnız bu oturumda kalır.
    }
  }

  function openCreate(kind?: SpaceKind) {
    if (!requireAuth("create")) return;
    setCreateKind(kind);
    setCreateOpen(true);
  }

  // Oluştur → Space (`?new=1`, docs/history/215-*): oluşturma penceresi bir kez açılır, parametre adresten silinir.
  const wantsNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (!wantsNew || authLoading) return;
    router.replace("/spaces");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adresten gelen tek seferlik açılış
    if (user) setCreateOpen(true);
    else requireAuth("create");
  }, [wantsNew, authLoading, user, router, requireAuth]);

  const updateOne = (next: SpaceSummary) => {
    setItems((list) => list?.map((item) => (item.id === next.id ? next : item)) ?? list);
    setRecent((list) => list.map((item) => (item.id === next.id ? next : item)));
  };
  const removeOne = (id: string) => {
    setItems((list) => list?.filter((item) => item.id !== id) ?? list);
    setRecent((list) => list.filter((item) => item.id !== id));
  };

  const menuItems: SectionMenuItem<SpaceFilter | "invites">[] = [
    { key: "all", label: t("spaces.filter.all") },
    { key: "mine", label: t("spaces.nav.mine") },
    { key: "shared", label: t("spaces.nav.shared") },
    { key: "favorites", label: t("spaces.filter.favorites") },
    { key: "public", label: t("spaces.filter.public") },
    { key: "archived", label: t("spaces.filter.archived") },
    ...(invites.length > 0 ? [{ key: "invites" as const, label: t("spaces.nav.invites"), count: invites.length }] : []),
  ];
  // Tür/görünürlük süzgeci yüklenmiş Space'ler üzerinde çalışır.
  const shown = items?.filter((item) => (!kindFilter || item.kind === kindFilter) && (!visibilityFilter || item.visibility === visibilityFilter)) ?? null;
  const filtersActive = sort !== "updated" || kindFilter !== null || visibilityFilter !== null;

  const showRecent = Boolean(user) && section === "all" && !debounced && recent.length > 0;
  const isEmptyLibrary = items !== null && items.length === 0 && !debounced && (effectiveFilter === "all" || effectiveFilter === "mine");
  // Tür karoları: oturumlu, "Tümü", arama yok; boş kütüphanede "İlk Space'ini oluştur" kartı zaten aynı işi yapar.
  const showTemplates = Boolean(user) && section === "all" && !debounced && !isEmptyLibrary && items !== null;

  const iconButton = CONTROL_ICON_BUTTON;
  return (
    <PageContainer className="space-y-5 pb-16 pt-3 sm:pt-5">
      <h1 className="font-display text-[2.375rem] font-bold leading-[1.1] tracking-[-0.02em] text-text">{t("spaces.home.title")}</h1>

      {searchOpen || query ? (
        <form role="search" className="relative" onSubmit={(event) => event.preventDefault()}>
          <Search size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("spaces.home.searchPlaceholder")}
            aria-label={t("spaces.home.searchPlaceholder")}
            autoFocus
            className="h-12 w-full rounded-xl border-2 border-primary bg-surface pl-11 pr-12 text-body text-text placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSearchOpen(false);
            }}
            aria-label={t("common.clear")}
            className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-text hover:bg-surface-soft"
          >
            <X size={20} />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1.5">
          {user && <SectionMenu items={menuItems} active={showInvites ? "invites" : filter} onChange={setSection} ariaLabel={t("spaces.filter.label")} title={t("spaces.home.title")} />}
          <span className="flex-1" />
          <button type="button" onClick={() => setSearchOpen(true)} aria-label={t("spaces.home.searchOpen")} title={t("spaces.home.searchOpen")} className={iconButton}>
            <Search size={22} strokeWidth={1.75} aria-hidden />
          </button>
          {!showInvites && (
            <>
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                aria-label={t("spaces.home.filterOpen")}
                title={t("spaces.home.filterOpen")}
                data-filter-button
                className={cn(iconButton, "relative", filtersActive && "bg-surface-soft")}
              >
                <ListFilter size={22} strokeWidth={1.75} aria-hidden />
                {filtersActive && <span aria-hidden className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />}
              </button>
              <button
                type="button"
                onClick={() => changeView(view === "grid" ? "list" : "grid")}
                aria-label={t(view === "grid" ? "spaces.home.viewList" : "spaces.home.viewGrid")}
                title={t(view === "grid" ? "spaces.home.viewList" : "spaces.home.viewGrid")}
                className={iconButton}
              >
                {view === "grid" ? <List size={22} strokeWidth={1.75} aria-hidden /> : <Grid2x2 size={22} strokeWidth={1.75} aria-hidden />}
              </button>
            </>
          )}
          <Button onClick={() => openCreate()} data-testid="create-space" title={t("spaces.home.create")} className="h-11 w-11 shrink-0 rounded-xl bg-surface-soft p-0 text-text shadow-none hover:bg-border-soft">
            <Plus size={22} strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{t("spaces.home.create")}</span>
          </Button>
        </div>
      )}

      {/* Bekleyen davet: tek satırlık kart (Topluluklar'daki gibi); dokununca "Davetler" bölümü açılır. */}
      {user && invites.length > 0 && !showInvites && (
        <button
          type="button"
          onClick={() => setSection("invites")}
          data-testid="space-invites-banner"
          className="flex w-full items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft/60 px-3 py-2.5 text-left transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
            <Mail size={17} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{t("spaces.invites.banner", { count: invites.length })}</span>
          <span className="shrink-0 text-small font-semibold text-primary">{t("spaces.invites.open")}</span>
        </button>
      )}

      {showTemplates && <SpaceTemplates onPick={(kind) => openCreate(kind)} />}

      {showRecent && (
        <section aria-labelledby="spaces-recent" className="space-y-2">
          <h2 id="spaces-recent" className="px-1 text-label font-semibold uppercase tracking-[0.08em] text-text-muted">
            {t("spaces.home.recent")}
          </h2>
          <ScrollRow as="ul" className="-mx-3 gap-3 px-3 pb-1 sm:mx-0 sm:px-0" data-testid="spaces-recent">
            {recent.map((space) => (
              <li key={space.id} className="w-24 shrink-0 sm:w-28">
                <Link href={spaceHref(space.id)} className="group block space-y-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <SpaceCoverArt
                    urls={summaryArt(space)}
                    className="aspect-square w-full overflow-hidden rounded-[1.1rem] shadow-card transition-transform duration-200 ease-soft group-active:scale-[0.97]"
                    iconSize={28}
                  />
                  <span className="block truncate text-small font-semibold text-text">{space.title}</span>
                  {space.lastOpenedAt && <span className="block truncate text-caption text-text-muted">{t("spaces.home.openedAgo", { time: formatRelativeTime(space.lastOpenedAt, language) })}</span>}
                </Link>
              </li>
            ))}
          </ScrollRow>
        </section>
      )}

      {!user && !authLoading && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-soft bg-primary-soft/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-small text-text-secondary">{t("spaces.home.guestHint")}</p>
          <Button size="sm" onClick={() => openCreate()}>
            {t("spaces.home.create")}
          </Button>
        </div>
      )}

      {showInvites ? (
        <InvitationList
          invites={invites}
          onAnswered={(invite, accepted) => {
            const rest = invites.filter((item) => item.id !== invite.id);
            setInvites(rest);
            if (rest.length === 0) setSection("all");
            if (accepted) router.push(spaceHref(invite.spaceId));
          }}
        />
      ) : (
        <section aria-label={t(FILTER_LABEL[effectiveFilter])} aria-busy={items === null}>
          {error ? (
            <EmptyState icon={SpacesIcon} title={t("spaces.home.loadError")} action={{ label: t("common.retry"), onClick: () => setReloadKey((k) => k + 1) }} compact />
          ) : items === null ? (
            <ul className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
              {Array.from({ length: 6 }, (_, index) => (
                <li key={index}>
                  <Skeleton className={view === "grid" ? "aspect-[4/5] w-full rounded-xl" : "h-20 w-full rounded-lg"} />
                </li>
              ))}
            </ul>
          ) : isEmptyLibrary && user ? (
            <FirstSpaceEmpty onCreate={() => openCreate()} />
          ) : shown === null || shown.length === 0 ? (
            <EmptyState
              icon={debounced || filtersActive ? Search : SpacesIcon}
              title={debounced || (items && items.length > 0) ? t("spaces.home.noResults") : t(`spaces.empty.${effectiveFilter}` as TranslationKey)}
              description={debounced || (items && items.length > 0) ? t("spaces.home.noResultsHelp") : undefined}
              compact
            />
          ) : (
            <>
              <ul data-testid="spaces-list" data-view={view} className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
                {shown.map((space) => (
                  <SpaceCard key={space.id} space={space} layout={view} userId={user?.id ?? null} palette={palettes.get(space.id)} onChange={updateOne} onRemove={removeOne} />
                ))}
              </ul>
              {hasMore && (
                <LoadMoreButton wrapperClassName="mt-6 flex justify-center" label={t("spaces.home.loadMore")} loading={loadingMore} onLoadMore={() => void loadMore()} />
              )}
            </>
          )}
        </section>
      )}

      {createOpen && <CreateSpaceModal initialKind={createKind} onClose={() => setCreateOpen(false)} />}
      {filterOpen && (
        <SpacesFilterSheet
          sort={sort}
          onSort={setSort}
          kind={kindFilter}
          onKind={setKindFilter}
          visibility={visibilityFilter}
          onVisibility={setVisibilityFilter}
          signedIn={Boolean(user)}
          onReset={() => {
            setSort("updated");
            setKindFilter(null);
            setVisibilityFilter(null);
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </PageContainer>
  );
}

function InvitationList({ invites, onAnswered }: { invites: MySpaceInvitation[]; onAnswered: (invite: MySpaceInvitation, accepted: boolean) => void }) {
  const { t, language } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(invite: MySpaceInvitation, accept: boolean) {
    setBusy(invite.id);
    setError(null);
    try {
      await respondSpaceInvitation(invite.id, accept);
      onAnswered(invite, accept);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="space-invites" className="space-y-2" data-testid="space-invitations">
      <h2 id="space-invites" className="text-label font-semibold uppercase tracking-[0.08em] text-text-muted">
        {t("spaces.invites.title", { count: invites.length })}
      </h2>
      <ul className="space-y-2">
        {invites.map((invite) => (
          <li key={invite.id} className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary-soft/40 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {invite.inviter && <Avatar src={invite.inviter.avatarUrl} alt="" size={36} />}
              <div className="min-w-0">
                <p className="truncate text-small font-semibold text-text">{invite.spaceTitle}</p>
                <p className="text-caption text-text-secondary">
                  {t("spaces.invites.line", {
                    name: invite.inviter?.displayName ?? "—",
                    role: t(SPACE_ROLE_LABEL[invite.role]),
                    kind: t(SPACE_KIND_LABEL[invite.spaceKind]),
                    time: formatRelativeTime(invite.createdAt, language),
                  })}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void answer(invite, true)} disabled={busy !== null}>
                {busy === invite.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
                {t("spaces.invites.accept")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void answer(invite, false)} disabled={busy !== null}>
                {t("spaces.invites.decline")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </section>
  );
}

/** İlk Space boş durumu: ne işe yaradığı + tek eylem + "örnek" etiketli küçük bir pano çizimi (gerçek veri gibi gösterilmez). */
function FirstSpaceEmpty({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-testid="spaces-first-empty" className="grid gap-6 rounded-xl border border-dashed border-border p-6 sm:p-8 lg:grid-cols-[1fr_minmax(0,360px)] lg:items-center">
      <div className="space-y-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-soft text-primary">
          <SpacesIcon size={20} aria-hidden />
        </span>
        <h2 className="text-h2 font-bold text-text">{t("spaces.empty.firstTitle")}</h2>
        <p className="max-w-md text-small text-text-secondary">{t("spaces.empty.firstBody")}</p>
        <ol className="space-y-1 text-small text-text-secondary">
          <li>1. {t("spaces.empty.step1")}</li>
          <li>2. {t("spaces.empty.step2")}</li>
          <li>3. {t("spaces.empty.step3")}</li>
        </ol>
        <Button onClick={onCreate} className="mt-1">
          <Plus size={16} aria-hidden />
          {t("spaces.empty.firstAction")}
        </Button>
      </div>
      <figure aria-label={t("spaces.empty.exampleLabel")} className="relative rounded-lg border border-border-soft bg-surface-soft p-4">
        <figcaption className="absolute right-3 top-3 rounded-full bg-surface px-2 py-0.5 text-caption font-semibold text-text-muted">{t("spaces.empty.exampleBadge")}</figcaption>
        <div aria-hidden className="grid grid-cols-3 gap-2 pt-6">
          <span className="col-span-2 row-span-2 flex aspect-square items-center justify-center rounded-md bg-primary-soft text-primary">
            <ImageIcon size={28} />
          </span>
          <span className="flex aspect-square items-center justify-center rounded-md bg-secondary/15 text-secondary">
            <ImageIcon size={18} />
          </span>
          <span className="flex aspect-square items-center justify-center rounded-md bg-warning/15 text-warning">
            <StickyNote size={18} />
          </span>
          <span className="col-span-2 flex items-center gap-2 rounded-md bg-surface px-3 py-2 font-mono text-caption text-text-secondary">
            <SquareTerminal size={14} />
            <span className="truncate">…</span>
          </span>
          <span className="flex gap-1 rounded-md bg-surface p-2">
            <span className="h-full flex-1 rounded bg-primary" />
            <span className="h-full flex-1 rounded bg-secondary" />
            <span className="h-full flex-1 rounded bg-success" />
          </span>
        </div>
      </figure>
    </div>
  );
}
