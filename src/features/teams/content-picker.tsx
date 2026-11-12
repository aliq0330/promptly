"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "@/components/icons/check";
import { Filter } from "@/components/icons/filter";
import { Loader2 } from "@/components/icons/loader-2";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { LoadMore } from "@/features/feed/load-more";
import { AdvancedSearchBox } from "@/features/search/advanced-search-box";
import { SearchFilterSections, type SearchSort } from "@/features/search/search-filter-sections";
import { tokensToQuery, type SearchToken } from "@/features/search/search-tokens";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { searchPresetsPage } from "@/lib/supabase/presets";
import { searchPromptsPage } from "@/lib/supabase/prompts";
import { searchRequestsPage } from "@/lib/supabase/requests";
import type { SearchCursor, SearchPage } from "@/lib/supabase/search";
import type { ContentSearchFilters } from "@/lib/supabase/taxonomy-query";
import { searchWorkflowsPage } from "@/lib/supabase/workflows";
import type { TeamCreateKind } from "@/lib/team-create";
import { cn } from "@/lib/utils";

/**
 * Ekip dosyası / pano için içerik SEÇME penceresi (docs/history/376-*). Prompt, İstek, Workflow ve Ayar paketi için AYNI pencere:
 * "Paylaştıklarım" ve "Başkalarının paylaştıkları" sekmeleri, üstte aramadaki gelişmiş arama kutusu (kişi, etiket, tür, araç çipleri) ve
 * satır içi Filtre bölümü — ikinci bir arama motoru yazılmadı (`AdvancedSearchBox` + `tokensToQuery` + `searchXPage`).
 * Seçilen içerik KOPYALANMAZ, dosyaya başvuru olarak eklenir. Yalnız yayınlanmış herkese açık içerik listelenir (sunucu da öyle ister).
 * Pencere birçok öğe eklemek için açık kalır; eklenen satır işaretlenir.
 */

export type PickedContent = { id: string; title: string };

const TITLE_KEY: Record<TeamCreateKind, TranslationKey> = {
  prompt: "tf.pick.title.prompt",
  request: "tf.pick.title.request",
  workflow: "tf.pick.title.workflow",
  preset: "tf.pick.title.preset",
};

type Tab = "mine" | "others";

interface Row {
  id: string;
  title: string;
  by: string;
}

interface Keyset {
  key: string;
  rows: Row[];
  cursor: SearchCursor | null;
  loading: boolean;
  loadingMore: boolean;
  failed: boolean;
}

const PAGE = 20;

async function fetchPage(kind: TeamCreateKind, text: string, filters: ContentSearchFilters, cursor: SearchCursor | null): Promise<SearchPage<Row>> {
  const map = <T extends { id: string; title: string }>(page: SearchPage<T>, by: (item: T) => string): SearchPage<Row> => ({
    nextCursor: page.nextCursor,
    items: page.items.map((item) => ({ id: item.id, title: item.title, by: by(item) })),
  });
  if (kind === "prompt") return map(await searchPromptsPage(text, filters, PAGE, cursor), (item) => item.author.username);
  if (kind === "request") return map(await searchRequestsPage(text, filters, PAGE, cursor), (item) => item.author.username);
  if (kind === "workflow") return map(await searchWorkflowsPage(text, filters, PAGE, cursor), (item) => item.creator.username);
  return map(await searchPresetsPage(text, filters, PAGE, cursor), (item) => item.creator.username);
}

export function ContentPickerDialog({
  kind,
  onClose,
  onPick,
  alreadyIds,
  overLayers = true,
}: {
  kind: TeamCreateKind;
  onClose: () => void;
  /** Seçilen içeriği dosyaya/panoya ekler; hata fırlatırsa satırda gösterilir. */
  onPick: (item: PickedContent) => Promise<void>;
  /** Bu dosyada zaten olan içeriklerin kimlikleri ("Eklendi" gösterilir). */
  alreadyIds?: ReadonlySet<string>;
  overLayers?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("mine");
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tokens, setTokens] = useState<SearchToken[]>([]);
  const [sort, setSort] = useState<SearchSort>("new");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [state, setState] = useState<Keyset | null>(null);
  const [retry, setRetry] = useState(0);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flight = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [text]);

  const userId = user?.id ?? null;
  const filters = useMemo<ContentSearchFilters>(() => {
    const base = tokensToQuery(tokens).filters;
    const sortKey = debounced && sort === "new" ? "relevant" : sort;
    if (!userId) return { ...base, sort: sortKey };
    // "Paylaştıklarım": yalnız kendi içeriğim (kişi çipleri yok sayılır); "Başkaları": kendim hariç (kişi çipleri daraltır).
    return tab === "mine" ? { ...base, authorIds: [userId], sort: sortKey } : { ...base, excludeAuthorIds: [userId], sort: sortKey };
  }, [tokens, sort, tab, userId, debounced]);

  const key = useMemo(() => `${retry}|${kind}|${tab}|${debounced}|${JSON.stringify(filters)}`, [retry, kind, tab, debounced, filters]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchPage(kind, debounced, filters, null)
      .then((page) => {
        if (!cancelled) setState({ key, rows: page.items, cursor: page.nextCursor, loading: false, loadingMore: false, failed: false });
      })
      .catch((err) => {
        console.error("ContentPickerDialog", err);
        if (!cancelled) setState({ key, rows: [], cursor: null, loading: false, loadingMore: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [key, kind, debounced, filters, userId]);

  const current = state && state.key === key ? state : null;
  const loadMore = useCallback(async () => {
    if (!current || !current.cursor || current.loadingMore) return;
    const flightKey = `${key}|${current.cursor.id}`;
    if (flight.current === flightKey) return;
    flight.current = flightKey;
    setState((prev) => (prev && prev.key === key ? { ...prev, loadingMore: true, failed: false } : prev));
    try {
      const page = await fetchPage(kind, debounced, filters, current.cursor);
      setState((prev) => {
        if (!prev || prev.key !== key) return prev;
        const seen = new Set(prev.rows.map((row) => row.id));
        return { ...prev, rows: [...prev.rows, ...page.items.filter((row) => !seen.has(row.id))], cursor: page.nextCursor, loadingMore: false };
      });
    } catch (err) {
      console.error("ContentPickerDialog (load more)", err);
      setState((prev) => (prev && prev.key === key ? { ...prev, loadingMore: false, failed: true } : prev));
    } finally {
      if (flight.current === flightKey) flight.current = null;
    }
  }, [current, key, kind, debounced, filters]);

  async function pick(row: Row) {
    setBusy(row.id);
    setError(null);
    try {
      await onPick({ id: row.id, title: row.title });
      setAdded((prev) => new Set(prev).add(row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(null);
    }
  }

  const activeFilters = tokens.length;
  const rows = current?.rows ?? [];

  return (
    <SpaceDialog
      title={t(TITLE_KEY[kind])}
      onClose={onClose}
      overLayers={overLayers}
      wide
      formTestId="team-content-picker"
      footer={
        <Button type="button" onClick={onClose} data-picker-done="">
          {t("tf.pick.done")}
        </Button>
      }
    >
      <div className="space-y-3" data-team-content-picker={kind}>
        <Tabs
          variant="segmented"
          ariaLabel={t(TITLE_KEY[kind])}
          active={tab}
          onChange={(next) => setTab(next)}
          items={[
            { key: "mine", label: t("tf.pick.tab.mine") },
            { key: "others", label: t("tf.pick.tab.others") },
          ]}
        />
        <AdvancedSearchBox tokens={tokens} onTokensChange={setTokens} text={text} onTextChange={setText} hideKindSuggestions placeholder={t("tf.pick.search")} />
        <div>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            data-picker-filter=""
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-soft px-3 text-small font-semibold text-text-secondary hover:bg-surface-soft"
          >
            <Filter size={15} aria-hidden />
            {t("tf.pick.filter")}
            {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-caption font-bold text-primary-foreground">{activeFilters}</span>}
          </button>
          {filtersOpen && (
            <div className="mt-2 space-y-3 rounded-xl border border-border-soft bg-surface-soft/50 p-3" data-picker-filter-panel="">
              <SearchFilterSections tokens={tokens} onTokensChange={setTokens} hideKinds sort={sort} onSortChange={setSort} />
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-small text-danger">
            {error}
          </p>
        )}

        {!current && (
          <p className="flex items-center gap-2 py-6 text-small text-text-muted" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {t("common.loading")}
          </p>
        )}
        {current?.failed && rows.length === 0 && (
          <div role="alert" className="space-y-2 py-4 text-center">
            <p className="text-small text-danger">{t("feed.loadFailed")}</p>
            <Button type="button" variant="outline" onClick={() => setRetry((n) => n + 1)}>
              {t("common.retry")}
            </Button>
          </div>
        )}
        {current && !current.failed && rows.length === 0 && (
          <p className="py-6 text-center text-small text-text-muted" data-picker-empty="">
            {t(tab === "mine" ? "tf.pick.empty.mine" : "tf.pick.empty.others")}
          </p>
        )}

        <ul className="divide-y divide-border-soft">
          {rows.map((row) => {
            const done = added.has(row.id) || alreadyIds?.has(row.id) === true;
            return (
              <li key={row.id} className="flex min-h-14 items-center gap-3 py-2" data-picker-row={row.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-text">{row.title}</span>
                  {tab === "others" && <span className="block truncate text-caption text-text-muted">@{row.by}</span>}
                </span>
                {done ? (
                  <span className={cn("inline-flex items-center gap-1 text-small font-semibold text-success")} data-picker-added={row.id}>
                    <Check size={15} aria-hidden />
                    {t("tf.pick.added")}
                  </span>
                ) : (
                  <Button type="button" size="sm" disabled={busy !== null} data-picker-add={row.id} onClick={() => void pick(row)}>
                    {busy === row.id ? <Loader2 size={15} className="animate-spin" aria-hidden /> : t("tf.pick.add")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {current && <LoadMore failed={current.failed && rows.length > 0} hasMore={current.cursor !== null} loadingMore={current.loadingMore} onLoadMore={() => void loadMore()} />}
      </div>
    </SpaceDialog>
  );
}
