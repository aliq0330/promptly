"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Download,
  FileText,
  Search,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  Upload,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { useAuth } from "@/features/auth/auth-provider";
import { type ContentSortKey } from "@/features/content/sort-select";
import { ListControlRow, SadeTitle } from "@/features/content/list-control-row";
import { SheetChips, SheetSection } from "@/features/content/list-toolbar";
import type { SectionMenuItem } from "@/features/content/section-menu";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { ProfileDraftsPanel } from "@/features/profile/profile-drafts-panel";
import { ExportPromptsModal } from "@/features/exchange/export-prompts-modal";
import { ImportPromptsModal } from "@/features/exchange/import-prompts-modal";
import { fetchOwnPromptsForExport } from "@/lib/supabase/prompt-exchange";
import { fetchAuthorPromptsPage, fetchProfileContentStats, type AuthorPromptSort, type ProfileContentStats } from "@/lib/supabase/prompts";
import { usePagedList } from "@/features/content/use-paged-list";
import { LoadMore } from "@/features/feed/load-more";
import { fetchRequestsByAuthorPage } from "@/lib/supabase/requests";
import { fetchWorkflowsByCreatorPage } from "@/lib/supabase/workflows";
import { fetchPresetsByCreatorPage } from "@/lib/supabase/presets";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { useViewMode } from "@/features/content/view-mode-store";
import { FocusGrid } from "@/features/focus/focus-grid";
import type { FeedItem } from "@/features/feed/types";

type Kind =
  | "prompts"
  | "requests"
  | "workflows"
  | "presets"
  | "drafts";
type VisibilityFilter = "all" | "public" | "private";

interface Entry {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  likeCount: number;
  isPrivate: boolean;
  node: ReactNode;
  /** The same row for the Izgara view (`FocusGrid`). */
  item: FeedItem;
}

/**
 * "İçeriklerim" — the signed-in member's own published prompts, requests,
 * workflows and presets in one place, with a visibility filter,
 * search and sort. Drafts reuse the profile's drafts panel. Data comes from
 * the same per-author fetchers the profile uses; RLS returns a member their
 * own private rows too.
 */
export function MyContentView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [viewMode] = useViewMode();

  const [kind, setKind] = useState<Kind>("prompts");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [sort, setSort] = useState<ContentSortKey>("newest");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // Dışa/İçe aktar (docs/history/250-*): yalnız Promptlar bölümünde.
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const userId = user?.id;
  const [stats, setStats] = useState<ProfileContentStats | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  // "Promptlar": visibility, sort and search are query conditions (server side), 24 per page, growing as the list is scrolled.
  const promptSort: AuthorPromptSort = sort === "oldest" || sort === "most-liked" ? sort : "newest";
  const promptPages = usePagedList(`mine|${userId ?? ""}|${promptSort}|${visibility}|${debouncedSearch}`, Boolean(userId) && kind === "prompts", (offset) =>
    fetchAuthorPromptsPage({ authorId: userId ?? "", sort: promptSort, visibility, search: debouncedSearch }, offset),
  );
  const prompts = promptPages.items;
  // "İstekler", "Workflow'lar", "Hazır ayarlar": same shape — filter, sort and search go to the query, a page at a time.
  const filter = { sort: promptSort, visibility, search: debouncedSearch };
  const filterKey = `${promptSort}|${visibility}|${debouncedSearch}`;
  const requestPages = usePagedList(`mine-requests|${userId ?? ""}|${filterKey}`, Boolean(userId) && kind === "requests", (offset) => fetchRequestsByAuthorPage(userId ?? "", filter, offset));
  const workflowPages = usePagedList(`mine-workflows|${userId ?? ""}|${filterKey}`, Boolean(userId) && kind === "workflows", (offset) => fetchWorkflowsByCreatorPage(userId ?? "", filter, offset));
  const presetPages = usePagedList(`mine-presets|${userId ?? ""}|${filterKey}`, Boolean(userId) && kind === "presets", (offset) => fetchPresetsByCreatorPage(userId ?? "", filter, offset));
  const requests = requestPages.items;
  const workflows = workflowPages.items;
  const presets = presetPages.items;
  // The tab counts come from the database (`profile_content_stats`): the lists are read a page at a time, so their lengths are no counts.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfileContentStats(userId).then((counted) => !cancelled && setStats(counted));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const entries = useMemo<Record<Exclude<Kind, "drafts">, Entry[]>>(
    () => ({
      prompts: prompts.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        createdAt: p.createdAt,
        likeCount: p.likeCount,
        isPrivate: p.visibility === "private",
        item: { kind: "prompt" as const, data: p },
        node: (
          <PromptCard
            prompt={p}
            onDeleted={() => {
              promptPages.removeItem(p.id);
              setStats((prev) => (prev ? { ...prev, prompts: Math.max(0, prev.prompts - 1) } : prev));
            }}
          />
        ),
      })),
      requests: requests.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        createdAt: r.createdAt,
        likeCount: r.likeCount,
        isPrivate: r.visibility === "private",
        node: <RequestCard request={r} />,
        item: { kind: "request" as const, data: r },
      })),
      workflows: workflows.map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description,
        createdAt: w.createdAt,
        likeCount: w.likeCount,
        isPrivate: w.visibility === "private",
        node: <WorkflowCard workflow={w} />,
        item: { kind: "workflow" as const, data: w },
      })),
      presets: presets.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        createdAt: p.createdAt,
        likeCount: p.likeCount,
        isPrivate: p.visibility === "private",
        node: <PresetCard preset={p} />,
        item: { kind: "preset" as const, data: p },
      })),
    }),
    [prompts, promptPages, requests, workflows, presets],
  );

  const kindTabs = useMemo(
    () => [
      {
        key: "prompts" as const,
        label: t("feed.filterPrompts"),
        count: stats?.prompts ?? promptPages.total ?? undefined,
        icon: SquareTerminal,
      },
      {
        key: "requests" as const,
        label: t("nav.requests"),
        count: stats?.requests ?? requestPages.total ?? undefined,
        icon: Sparkles,
      },
      {
        key: "workflows" as const,
        label: t("nav.workflows"),
        count: stats?.workflows ?? workflowPages.total ?? undefined,
        icon: WorkflowIcon,
      },
      {
        key: "presets" as const,
        label: t("nav.presets"),
        count: stats?.presets ?? presetPages.total ?? undefined,
        icon: SlidersHorizontal,
      },
      { key: "drafts" as const, label: t("profile.tabDrafts"), icon: FileText },
    ],
    [
      t,
      stats,
      promptPages.total,
      requestPages.total,
      workflowPages.total,
      presetPages.total,
    ],
  );

  const createLinks: Record<
    Exclude<Kind, "drafts">,
    { href: string; label: string }
  > = {
    prompts: { href: "/create?mode=prompt", label: t("create.promptTitle") },
    requests: { href: "/requests/new", label: t("create.requestTitle") },
    workflows: { href: "/workflows/create", label: t("workflow.create") },
    presets: { href: "/presets/create", label: t("preset.create") },
  };

  // Every kind is filtered, searched and sorted by the database; the list is shown as loaded.
  const visible = kind === "drafts" ? [] : entries[kind];
  const pages = kind === "drafts" ? promptPages : { prompts: promptPages, requests: requestPages, workflows: workflowPages, presets: presetPages }[kind];

  // "Is there anything at all?" — for prompts the counted total; a filtered-to-nothing list is then "no match", not "no content".
  const total = kind === "drafts" ? 0 : (stats?.[kind] ?? pages.total ?? entries[kind].length);

  const searching = searchOpen || search !== "";
  const menuItems: SectionMenuItem<Kind>[] = kindTabs.map((tab) => ({ key: tab.key, label: tab.label, icon: tab.icon, meta: "count" in tab ? tab.count : undefined, dividerBefore: tab.key === "drafts" }));

  return (
    <PageContainer className="space-y-5 pb-16 pt-3 sm:pt-5">
      <SadeTitle>{t("myContent.title")}</SadeTitle>
      <p className="sr-only">{t("myContent.description")}</p>

      {/* Sade düzen (docs/history/235-*): tek "Promptlar ▾" tür menüsü (sayılarla) + arama · Filtre (görünürlük, sıralama) · Kart/Izgara · "+". */}
      <ListControlRow
        showView={kind !== "drafts"}
        menu={{ items: menuItems, active: kind, onChange: setKind, ariaLabel: t("myContent.kindsAria"), title: t("myContent.title") }}
        search={kind === "drafts" ? undefined : { open: searching, onToggle: () => (searching ? (setSearch(""), setSearchOpen(false)) : setSearchOpen(true)), label: t("myContent.searchPlaceholder") }}
        filter={
          kind === "drafts"
            ? undefined
            : {
                sheetSections: (
                  <SheetSection title={t("myContent.visibilityAria")}>
                    <SheetChips>
                      {(["all", "public", "private"] as const).map((value) => (
                        <Chip key={value} selected={visibility === value} onClick={() => setVisibility(value)}>
                          {value === "all" ? t("common.all") : t(value === "public" ? "visibility.public" : "visibility.private")}
                        </Chip>
                      ))}
                    </SheetChips>
                  </SheetSection>
                ),
                sort,
                onSortChange: setSort,
                activeCount: visibility !== "all" ? 1 : 0,
                onClear: () => setVisibility("all"),
              }
        }
        create={kind === "drafts" ? undefined : createLinks[kind]}
      />
      {kind === "prompts" && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)} data-testid="my-content-import">
            <Upload size={14} />
            {t("exchange.import.menu")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setExportOpen(true)} data-testid="my-content-export">
            <Download size={14} />
            {t("exchange.export.menu")}
          </Button>
        </div>
      )}
      {searching && kind !== "drafts" && (
        <div className="relative">
          <Search size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("myContent.searchPlaceholder")}
            aria-label={t("myContent.searchPlaceholder")}
            autoFocus
            className="h-12 w-full rounded-xl border-2 border-primary bg-surface pl-11 pr-4 text-body text-text placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      )}

      {kind === "drafts" ? (
        user && <ProfileDraftsPanel userId={user.id} />
      ) : (
        <>
          {pages.loading ? (
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
              {[0, 1, 2].map((i) => (
                <Skeleton
                  key={i}
                  className="mb-4 h-56 w-full break-inside-avoid rounded-xl"
                />
              ))}
            </div>
          ) : pages.failed && visible.length === 0 ? (
            <div className="space-y-3 py-8 text-center" role="alert">
              <p className="text-small text-danger">{t("feed.loadFailed")}</p>
              <Button type="button" variant="outline" onClick={pages.retry} data-testid="my-content-retry">
                {t("common.retry")}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            total === 0 ? (
              <EmptyState
                icon={FileText}
                title={t("myContent.emptyTitle")}
                description={t("myContent.emptyBody")}
                action={createLinks[kind]}
              />
            ) : (
              <EmptyState
                icon={Search}
                title={t("myContent.noMatchTitle")}
                description={t("myContent.noMatchBody")}
                compact
              />
            )
          ) : viewMode === "focus" ? (
            <FocusGrid items={visible.map((entry) => entry.item)} />
          ) : (
            <ContentGrid>
              {visible.map((entry, index) => (
                <Reveal key={entry.id} index={index} className={CONTENT_GRID_ITEM_CLASS}>
                  {entry.node}
                </Reveal>
              ))}
            </ContentGrid>
          )}
          {!pages.loading && (
            <LoadMore failed={pages.failed} hasMore={pages.hasMore} loadingMore={pages.loadingMore} onLoadMore={() => void pages.loadMore()} auto />
          )}
        </>
      )}
      {exportOpen && userId && <ExportPromptsModal load={() => fetchOwnPromptsForExport(userId)} onClose={() => setExportOpen(false)} />}
      {importOpen && <ImportPromptsModal onClose={() => setImportOpen(false)} onImported={() => setKind("drafts")} />}
    </PageContainer>
  );
}
