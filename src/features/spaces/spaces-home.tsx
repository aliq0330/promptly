"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Grid2x2, ImageIcon, List, Loader2, Plus, Search, SquareTerminal, StickyNote, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  fetchMySpaceInvitations,
  listSpaces,
  respondSpaceInvitation,
  summaryCover,
  type MySpaceInvitation,
  type SpaceSummary,
} from "@/lib/supabase/spaces";
import { isSpaceFilter, SPACE_KIND_LABEL, SPACE_PAGE_SIZE, SPACE_ROLE_LABEL, SPACE_SORTS, spaceHref, type SpaceFilter, type SpaceSort } from "@/lib/spaces";
import { CreateSpaceModal } from "./space-modals";
import { SpaceCard } from "./space-card";
import { SpaceCoverArt, SpacesIcon } from "./space-visuals";

const FILTER_LABEL: Record<SpaceFilter, TranslationKey> = {
  all: "spaces.filter.all",
  mine: "spaces.filter.mine",
  shared: "spaces.filter.shared",
  favorites: "spaces.filter.favorites",
  public: "spaces.filter.public",
  archived: "spaces.filter.archived",
};

const SORT_LABEL: Record<SpaceSort, TranslationKey> = {
  updated: "spaces.sort.updated",
  opened: "spaces.sort.opened",
  created: "spaces.sort.created",
  title: "spaces.sort.title",
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
 * Spaces ana sayfası (docs/history/213-*): bekleyen davetler, arama (proje adı/açıklaması + içindeki görsel/prompt/not metinleri —
 * sunucuda), süzgeçler (Tümü · Benim · Paylaşılanlar · Favoriler · Herkese açık · Arşiv), sıralama, ızgara/liste, "Son açılanlar"
 * şeridi ve kademeli yükleme. Ziyaretçi yalnız herkese açık Space'leri görür; oluşturmak giriş ister.
 */
export function SpacesHome() {
  const { t, language } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter");
  const [filter, setFilter] = useState<SpaceFilter>(isSpaceFilter(initialFilter) ? initialFilter : "all");
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
  const [createOpen, setCreateOpen] = useState(false);
  const requestId = useRef(0);

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

  function openCreate() {
    if (!requireAuth("create")) return;
    setCreateOpen(true);
  }

  const updateOne = (next: SpaceSummary) => {
    setItems((list) => list?.map((item) => (item.id === next.id ? next : item)) ?? list);
    setRecent((list) => list.map((item) => (item.id === next.id ? next : item)));
  };
  const removeOne = (id: string) => {
    setItems((list) => list?.filter((item) => item.id !== id) ?? list);
    setRecent((list) => list.filter((item) => item.id !== id));
  };

  const showRecent = Boolean(user) && filter === "all" && !debounced && recent.length > 0;
  const isEmptyLibrary = items !== null && items.length === 0 && !debounced && (effectiveFilter === "all" || effectiveFilter === "mine");

  return (
    <PageContainer className="space-y-6 pb-16 pt-4 sm:pt-6">
      <PageHeader
        icon={SpacesIcon}
        eyebrow="Promptly"
        title={t("spaces.home.title")}
        description={t("spaces.home.tagline")}
        actions={
          <Button onClick={openCreate} data-testid="create-space">
            <Plus size={16} aria-hidden />
            {t("spaces.home.create")}
          </Button>
        }
      />

      {invites.length > 0 && (
        <InvitationList
          invites={invites}
          onAnswered={(invite, accepted) => {
            setInvites((list) => list.filter((item) => item.id !== invite.id));
            if (accepted) router.push(spaceHref(invite.spaceId));
          }}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form role="search" className="relative min-w-0 flex-1" onSubmit={(event) => event.preventDefault()}>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("spaces.home.searchPlaceholder")}
              aria-label={t("spaces.home.searchPlaceholder")}
              className="h-11 w-full rounded-full border border-border bg-surface pl-10 pr-10 text-small text-text shadow-xs placeholder:text-text-muted focus:border-primary/60"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("common.clear")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-muted hover:bg-surface-soft">
                <X size={14} />
              </button>
            )}
          </form>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SpaceSort)}
              aria-label={t("spaces.sort.label")}
              className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-small font-medium text-text sm:flex-none"
            >
              {SPACE_SORTS.filter((key) => key !== "opened" || user).map((key) => (
                <option key={key} value={key}>
                  {t(SORT_LABEL[key])}
                </option>
              ))}
            </select>
            <div role="group" aria-label={t("spaces.home.viewLabel")} className="flex rounded-full border border-border bg-surface p-0.5">
              {(["grid", "list"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeView(key)}
                  aria-pressed={view === key}
                  aria-label={t(key === "grid" ? "spaces.home.viewGrid" : "spaces.home.viewList")}
                  className={cn("flex h-9 w-10 items-center justify-center rounded-full transition-colors", view === key ? "bg-text text-background" : "text-text-muted hover:text-text")}
                >
                  {key === "grid" ? <Grid2x2 size={16} aria-hidden /> : <List size={16} aria-hidden />}
                </button>
              ))}
            </div>
          </div>
        </div>
        {user && (
          <ChipRow aria-label={t("spaces.filter.label")}>
            {(["all", "mine", "shared", "favorites", "public", "archived"] as const).map((key) => (
              <Chip key={key} selected={filter === key} onClick={() => setFilter(key)} data-space-filter={key}>
                {t(FILTER_LABEL[key])}
              </Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {!user && !authLoading && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-soft bg-primary-soft/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-small text-text-secondary">{t("spaces.home.guestHint")}</p>
          <Button size="sm" onClick={openCreate}>
            {t("spaces.home.create")}
          </Button>
        </div>
      )}

      {showRecent && (
        <section aria-labelledby="spaces-recent" className="space-y-2">
          <h2 id="spaces-recent" className="text-label font-semibold uppercase tracking-[0.08em] text-text-muted">
            {t("spaces.home.recent")}
          </h2>
          <ul className="scrollbar-none -mx-3 flex touch-pan-x gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" data-testid="spaces-recent">
            {recent.map((space) => (
              <li key={space.id} className="w-36 shrink-0">
                <Link href={spaceHref(space.id)} className="block space-y-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <SpaceCoverArt urls={summaryCover(space) ? [summaryCover(space)!] : space.previewUrls} className="aspect-square w-full overflow-hidden rounded-md" iconSize={28} />
                  <span className="block truncate text-small font-semibold text-text">{space.title}</span>
                  {space.lastOpenedAt && <span className="block truncate text-caption text-text-muted">{t("spaces.home.openedAgo", { time: formatRelativeTime(space.lastOpenedAt, language) })}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t(FILTER_LABEL[effectiveFilter])} aria-busy={items === null}>
        {error ? (
          <EmptyState icon={SpacesIcon} title={t("spaces.home.loadError")} action={{ label: t("common.retry"), onClick: () => setReloadKey((k) => k + 1) }} compact />
        ) : items === null ? (
          <ul className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index}>
                <Skeleton className={view === "grid" ? "aspect-[4/3] w-full rounded-lg" : "h-20 w-full rounded-lg"} />
              </li>
            ))}
          </ul>
        ) : isEmptyLibrary && user ? (
          <FirstSpaceEmpty onCreate={openCreate} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={debounced ? Search : SpacesIcon}
            title={debounced ? t("spaces.home.noResults") : t(`spaces.empty.${effectiveFilter}` as TranslationKey)}
            description={debounced ? t("spaces.home.noResultsHelp") : undefined}
            compact
          />
        ) : (
          <>
            <ul data-testid="spaces-list" data-view={view} className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
              {items.map((space) => (
                <SpaceCard key={space.id} space={space} layout={view} userId={user?.id ?? null} onChange={updateOne} onRemove={removeOne} />
              ))}
            </ul>
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore && <Loader2 size={14} className="animate-spin" aria-hidden />}
                  {t("spaces.home.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {createOpen && <CreateSpaceModal onClose={() => setCreateOpen(false)} />}
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
