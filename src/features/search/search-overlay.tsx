"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { Clock } from "@/components/icons/clock";
import { Filter } from "@/components/icons/filter";
import { Search } from "@/components/icons/search";
import { X } from "@/components/icons/x";
import { Avatar } from "@/components/ui/avatar";
import { CountBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Portal } from "@/components/ui/portal";
import { Tabs } from "@/components/ui/tabs";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { AI_TOOLS, searchTools } from "@/lib/ai-tool-catalog";
import { CONTENT_TYPE_IDS } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { FOCUSABLE_SELECTOR, tabTarget } from "@/lib/modal-focus";
import { SKILLS_MENU_ENABLED } from "@/lib/skills/flag";
import { searchProfiles } from "@/lib/supabase/profiles";
import { fetchPopularTags, searchTags } from "@/lib/supabase/tags";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { useKeyboardViewport } from "@/lib/use-keyboard-viewport";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";
import { KIND_LABEL, tokenChip } from "./search-chip-meta";
import { SearchChipStrip } from "./search-chip-strip";
import { SEARCH_FILTER_SECTIONS, type SearchFilterSectionKey } from "./search-filter-sections";
import { clearRecentSearches, readRecentSearches, rememberSearch } from "./search-recents";
import { tokenKey, type ContentKind, type SearchToken } from "./search-tokens";

const DEBOUNCE_MS = 250;
type GroupKey = SearchToken["kind"] | "recent" | "popular";
const GROUP_LABEL: Record<GroupKey, TranslationKey> = {
  user: "search.groupUsers",
  tag: "search.groupTags",
  media: "search.groupMedia",
  content: "search.groupKind",
  tool: "search.groupTools",
  recent: "search.recent",
  popular: "search.popularTags",
};
const GROUP_ORDER: GroupKey[] = ["recent", "popular", "user", "tag", "media", "content", "tool"];

/** One row of the suggestion list: a chip to add, or a past text search to run again. */
type Entry = { id: string; group: GroupKey; token?: SearchToken; recent?: string };

/** Popular tags are the same for everyone: fetched once per page load, only when the empty box is first opened. */
let popularTagsCache: Tag[] | null = null;

/** The Filtre side of the layer: the page hands over what its filters edit (the same node its Filtre sheet shows, one group at a time). */
export interface SearchOverlayFilters {
  /** One filter group's body (`SearchFilterSections section=…`). */
  render: (section: SearchFilterSectionKey) => ReactNode;
  /** Single-kind scopes (Keşfet → Promptlar): the post-type group is pointless. */
  hideKinds?: boolean;
  /** How many filters narrow the search now (the Filtre button's badge). */
  count: number;
  onClear: () => void;
}

type View = "search" | SearchFilterSectionKey;

/**
 * The full-screen search layer (docs/history/421-*, mockup "B · Tam ekran arama"): tapping the search box opens it instead of floating a
 * panel over the page, so the on-screen keyboard and the suggestions never fight for the same room and Filtre is always reachable.
 *   Phone  — the whole screen: back · input · Filtre on top (pinned), the chips under it, suggestions below, ONE big action above the
 *            keyboard ("Sonuçları göster"). Filtre turns the same screen into the filter mode: the groups are tabs, "Uygula" closes.
 *   md+    — a centred command palette: input on top, a left rail (Ara · filter groups), suggestions or the group on the right, key hints.
 * It edits the page's own `tokens` / `text` live (the page searches behind it); closing just reveals the results. Fits the visible area
 * above the keyboard (`useKeyboardViewport`, like `Modal`).
 */
export function SearchOverlay({
  tokens,
  onTokensChange,
  text,
  onTextChange,
  placeholder,
  hideKindSuggestions,
  filters,
  onClose,
}: {
  tokens: SearchToken[];
  onTokensChange: (next: SearchToken[]) => void;
  text: string;
  onTextChange: (next: string) => void;
  placeholder?: string;
  hideKindSuggestions?: boolean;
  filters?: SearchOverlayFilters;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-list`;
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboard = useKeyboardViewport();
  const [view, setView] = useState<View>("search");
  const [active, setActive] = useState(-1);
  const [pendingRemove, setPendingRemove] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recents, setRecents] = useState<string[]>(() => readRecentSearches());
  const [popular, setPopular] = useState<Tag[]>(popularTagsCache ?? []);
  const word = text.trim();
  const sections = useMemo(() => SEARCH_FILTER_SECTIONS.filter((section) => !(section.key === "kind" && filters?.hideKinds)), [filters?.hideKinds]);

  useEffect(() => {
    lockBodyScroll();
    return unlockBodyScroll;
  }, []);

  // Popular tags (a few, once per page load) for the empty box.
  useEffect(() => {
    if (popularTagsCache) return;
    let cancelled = false;
    void fetchPopularTags(6).then((found) => {
      popularTagsCache = found;
      if (!cancelled) setPopular(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Remote suggestions: debounced, bounded (4 users, 5 tags), stale answers dropped.
  useEffect(() => {
    if (!word) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale suggestions when the box is emptied
      setUsers([]);
      setTags([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const [foundUsers, foundTags] = await Promise.all([searchProfiles(word, 4), searchTags(word, 5)]);
      if (cancelled) return;
      setUsers(foundUsers);
      setTags(foundTags);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [word]);

  const selected = useMemo(() => new Set(tokens.map(tokenKey)), [tokens]);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    if (!word) {
      recents.forEach((recent) => out.push({ id: `recent:${recent}`, group: "recent", recent }));
      popular.forEach((tag) => out.push({ id: `popular:${tag.slug}`, group: "popular", token: { kind: "tag", tag } }));
    } else {
      const q = normalizeTagLabel(word.replace(/^[@#]/, ""));
      const matches = (label: string) => !q || normalizeTagLabel(label).includes(q);
      const add = (token: SearchToken) => out.push({ id: tokenKey(token), group: token.kind, token });
      if (!word.startsWith("#")) users.forEach((user) => add({ kind: "user", user }));
      if (!word.startsWith("@")) tags.forEach((tag) => add({ kind: "tag", tag }));
      if (!word.startsWith("@") && !word.startsWith("#")) {
        CONTENT_TYPE_IDS.filter((type) => matches(t(CONTENT_TYPE_META[type].labelKey))).forEach((type) => add({ kind: "media", type }));
        (hideKindSuggestions ? [] : ((SKILLS_MENU_ENABLED ? ["prompt", "request", "workflow", "preset", "skill"] : ["prompt", "request", "workflow", "preset"]) as ContentKind[]))
          .filter((kind) => matches(t(KIND_LABEL[kind])))
          .forEach((kind) => add({ kind: "content", type: kind }));
        searchTools(AI_TOOLS.filter((tool) => tool.isActive), word).slice(0, 4).forEach((tool) => add({ kind: "tool", toolId: tool.id }));
      }
    }
    return out
      .filter((entry) => !entry.token || !selected.has(tokenKey(entry.token)))
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [word, users, tags, recents, popular, selected, t, hideKindSuggestions]);

  function addToken(token: SearchToken) {
    onTokensChange([...tokens, token]);
    onTextChange("");
    setActive(-1);
    setPendingRemove(false);
    setUsers([]);
    setTags([]);
    inputRef.current?.focus();
  }
  function removeToken(key: string) {
    onTokensChange(tokens.filter((token) => tokenKey(token) !== key));
    setPendingRemove(false);
    inputRef.current?.focus();
  }
  /** Shows the results: the text is remembered as a recent search and the layer closes (the page has been searching behind it all along). */
  function commit() {
    rememberSearch(word);
    onClose();
  }
  function pick(entry: Entry) {
    if (entry.token) addToken(entry.token);
    else if (entry.recent) {
      onTextChange(entry.recent);
      rememberSearch(entry.recent);
      onClose();
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && text === "" && tokens.length > 0) {
      event.preventDefault();
      if (pendingRemove) removeToken(tokenKey(tokens[tokens.length - 1]));
      else setPendingRemove(true);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0 && entries[active]) pick(entries[active]);
      // "@" / "#" = "I want a person / tag": Enter takes the first suggestion without arrowing down to it.
      else if (/^[@#]/.test(word) && entries.length > 0) pick(entries[0]);
      else commit();
      return;
    }
    if (!entries.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % entries.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? entries.length - 1 : i - 1));
    }
  }

  // Escape steps back (filter group → suggestions → closed). It listens on the document in the CAPTURE phase: the focus may be nowhere
  // (the button that was pressed just left the screen), and the layer can open over a `Modal` (the content picker) whose own Escape
  // handler must not take that dialog down too.
  const escapeRef = useRef<() => void>(() => {});
  useEffect(() => {
    escapeRef.current = () => {
      if (view !== "search") setView("search");
      else onClose();
    };
  });
  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      escapeRef.current();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, []);
  // Back in the suggestions the input takes the focus again (the filter group it was in is gone).
  useEffect(() => {
    if (view === "search") inputRef.current?.focus({ preventScroll: true });
  }, [view]);

  /** Tab turns inside the layer; it stops here so a `Modal` under the layer does not pull the focus back into itself. */
  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    event.stopPropagation();
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.getClientRects().length > 0);
    const target = tabTarget(focusable.length, focusable.indexOf(document.activeElement as HTMLElement), event.shiftKey);
    if (target >= 0) {
      event.preventDefault();
      focusable[target].focus();
    }
  }

  const countOf = (section: (typeof SEARCH_FILTER_SECTIONS)[number]) => (section.tokenKind ? tokens.filter((token) => token.kind === section.tokenKind).length : 0);
  const filtering = view !== "search";
  const hasQuery = Boolean(word) || tokens.length > 0;
  const label = placeholder ?? t("search.placeholder");
  const frame = keyboard ? ({ "--kb-top": `${keyboard.top}px`, "--kb-h": `${keyboard.height}px` } as CSSProperties) : undefined;
  const filterLabel = filters && filters.count > 0 ? t("toolbar.filterWithCount", { count: filters.count }) : t("toolbar.filter");

  const suggestions = (
    <div className="px-1 md:px-0">
      {entries.length > 0 && (
        <ul id={listId} role="listbox" aria-label={t("taxonomy.suggestionsAriaLabel")}>
          {entries.map((entry, index) => {
            const showHeading = index === 0 || entries[index - 1].group !== entry.group;
            const token = entry.token;
            const chip = token ? tokenChip(token, t) : null;
            const Icon = chip?.icon ?? Clock;
            return (
              <li key={entry.id} role="presentation">
                {showHeading && (
                  <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
                    <p className="text-caption font-semibold text-text-muted">{t(GROUP_LABEL[entry.group])}</p>
                    {entry.group === "recent" && (
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentSearches();
                          setRecents([]);
                        }}
                        className="inline-flex h-9 items-center text-caption font-medium text-text-muted hover:text-text"
                      >
                        {t("search.clearRecent")}
                      </button>
                    )}
                  </div>
                )}
                <button
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  type="button"
                  // The input keeps the focus (and so the keyboard) while a row is picked.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(entry)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left text-label text-text transition-colors",
                    index === active ? "bg-surface-soft" : "hover:bg-surface-soft",
                  )}
                >
                  {token?.kind === "user" ? (
                    <>
                      <Avatar src={token.user.avatarUrl} alt={token.user.displayName} size={32} />
                      <span className="truncate">@{token.user.username}</span>
                      <span className="truncate text-caption text-text-muted">{token.user.displayName}</span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-soft text-text-secondary">
                        <Icon size={16} aria-hidden />
                      </span>
                      <span className="truncate">{token?.kind === "tag" ? `#${chip?.label}` : (chip?.label ?? entry.recent)}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {word && entries.length === 0 && <p className="px-2.5 py-4 text-small text-text-muted">{t("search.noMatch")}</p>}
      <p className="px-2.5 pb-2 pt-3 text-caption text-text-muted">{t("search.suggestHint")}</p>
    </div>
  );

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        id="search-overlay"
        data-search-overlay
        style={frame}
        onKeyDown={handlePanelKeyDown}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        // The layer ITSELF always covers the whole screen with an opaque ground (phone), so a stale / half-finished keyboard measurement
        // (iOS reports the visible area in steps while the keyboard slides in) can never show the page underneath; only the panel inside
        // follows the visible area above the keyboard.
        className="fixed inset-0 z-(--z-picker) flex animate-fade-in max-md:bg-surface md:items-start md:justify-center md:bg-scrim md:p-6 md:pt-[8dvh]"
      >
        <div
          ref={panelRef}
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)] max-md:absolute max-md:inset-x-0 max-md:top-[var(--kb-top,0px)] max-md:h-[var(--kb-h,100%)] md:max-w-3xl md:flex-none md:h-[min(34rem,78dvh)] md:rounded-xl md:border md:border-border-soft md:bg-surface-elevated md:pt-0 md:shadow-pop"
        >
          {/* Top: the input (always on md+, on the phone only in the search view) … */}
          <div className={cn("shrink-0 items-center gap-2 border-b border-border-soft px-2 py-2 md:flex md:px-4 md:py-3", filtering ? "max-md:hidden" : "flex")}>
            <button type="button" aria-label={t("common.back")} onClick={onClose} className={cn(iconButtonClassName(false, "h-10 w-10 shrink-0"), "md:hidden")}>
              <ArrowLeft size={20} aria-hidden />
            </button>
            <div role="search" className="relative flex h-11 min-w-0 flex-1 items-center rounded-sm bg-surface-soft pl-3 pr-1 focus-within:ring-2 focus-within:ring-primary/30">
              <Search size={20} aria-hidden className="mr-2 hidden shrink-0 text-text-muted md:block" />
              <input
                ref={inputRef}
                id={id}
                type="text"
                role="combobox"
                aria-expanded={entries.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-label={label}
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
                autoCorrect="off"
                enterKeyHint="search"
                // Opening the layer IS the "I want to type" tap, so (unlike a dialog on a page) the keyboard comes up at once.
                autoFocus
                value={text}
                onChange={(event) => {
                  onTextChange(event.target.value);
                  setActive(-1);
                  setPendingRemove(false);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder={tokens.length ? t("search.chipPlaceholder") : label}
                className="h-full min-w-0 flex-1 bg-transparent text-small text-text placeholder:text-text-muted focus:outline-none"
              />
              {text && (
                <button
                  type="button"
                  aria-label={t("search.clearText")}
                  onClick={() => {
                    onTextChange("");
                    setPendingRemove(false);
                    inputRef.current?.focus();
                  }}
                  className={iconButtonClassName(false, "h-9 w-9 shrink-0")}
                >
                  <X size={16} />
                </button>
              )}
              {filters && (
                <button
                  type="button"
                  data-search-overlay-filter
                  aria-label={filterLabel}
                  onClick={() => setView(sections[0].key)}
                  className={cn(iconButtonClassName(false, "relative h-9 w-9 shrink-0 bg-primary-soft text-primary-text hover:bg-primary-soft hover:text-primary-text"), "md:hidden")}
                >
                  <Filter size={20} aria-hidden />
                  {filters.count > 0 && (
                    <CountBadge tone="primary" className="absolute -right-1.5 -top-1.5">
                      {filters.count}
                    </CountBadge>
                  )}
                </button>
              )}
            </div>
            <button type="button" aria-label={t("common.close")} onClick={onClose} className={cn(iconButtonClassName(false, "h-10 w-10 shrink-0"), "max-md:hidden")}>
              <X size={20} aria-hidden />
            </button>
          </div>

          {/* … or, on the phone's filter mode, its title bar. */}
          {filtering && filters && (
            <div className="flex shrink-0 items-center gap-1 px-2 py-2 md:hidden">
              <button type="button" aria-label={t("common.back")} onClick={() => setView("search")} className={iconButtonClassName(false, "h-10 w-10 shrink-0")}>
                <ArrowLeft size={20} aria-hidden />
              </button>
              <h2 className="flex-1 text-h3 font-bold text-text">{t("toolbar.filterTitle")}</h2>
              <button
                type="button"
                onClick={filters.onClear}
                disabled={filters.count === 0}
                className="inline-flex h-10 items-center px-3 text-label font-semibold text-primary-text hover:text-primary-hover disabled:text-text-muted"
              >
                {t("toolbar.clear")}
              </button>
            </div>
          )}

          {tokens.length > 0 && (
            <SearchChipStrip
              tokens={tokens}
              onRemove={removeToken}
              onClear={() => {
                onTokensChange([]);
                onTextChange("");
                setPendingRemove(false);
                inputRef.current?.focus();
              }}
              pendingKey={pendingRemove ? tokenKey(tokens[tokens.length - 1]) : null}
              className={cn("shrink-0 px-3 pt-2.5 md:px-4", filtering && "max-md:hidden")}
            />
          )}

          <div className="flex min-h-0 flex-1">
            {filters && (
              <nav aria-label={t("search.filterSectionsAria")} className="hidden w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border-soft p-2 md:flex">
                <RailButton current={view === "search"} onClick={() => setView("search")}>
                  <Search size={16} aria-hidden />
                  {t("search.railSearch")}
                </RailButton>
                <p className="px-3 pb-1 pt-3 text-caption font-semibold text-text-muted">{t("toolbar.filter")}</p>
                {sections.map((section) => (
                  <RailButton key={section.key} current={view === section.key} onClick={() => setView(section.key)} count={countOf(section)}>
                    {t(section.labelKey)}
                  </RailButton>
                ))}
              </nav>
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {filtering && filters && (
                <div className="shrink-0 border-b border-border-soft px-3 md:hidden">
                  <Tabs
                    ariaLabel={t("search.filterSectionsAria")}
                    items={sections.map((section) => ({ key: section.key, label: t(section.labelKey), count: countOf(section) || undefined }))}
                    active={view as SearchFilterSectionKey}
                    onChange={setView}
                  />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 md:p-4">
                {filtering && filters ? (
                  <div className="space-y-4 px-2 py-2 md:p-0" data-search-overlay-filters>
                    {filters.render(view as SearchFilterSectionKey)}
                  </div>
                ) : (
                  suggestions
                )}
              </div>
            </div>
          </div>

          {/* The one big action, right above the keyboard on the phone; the key hints beside it on md+. */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-3 border-t border-border-soft px-3 pt-2.5 md:px-4 md:pb-3",
              keyboard ? "pb-2.5" : "pb-[max(0.625rem,env(safe-area-inset-bottom,0px))]",
              !filtering && !hasQuery && "max-md:hidden",
            )}
          >
            <p className="hidden flex-1 text-caption text-text-muted md:block">{t("search.hintKeys")}</p>
            {filtering ? (
              <Button className="h-11 w-full md:w-auto" onClick={onClose}>
                {t("toolbar.apply")}
              </Button>
            ) : (
              hasQuery && (
                <Button className="h-11 min-w-0 flex-1 md:flex-none" onClick={commit}>
                  <span className="truncate">{word ? t("search.showResultsFor", { q: word }) : t("search.showResults")}</span>
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** One left-rail row of the md+ palette. */
function RailButton({ current, onClick, count, children }: { current: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-current={current ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-sm px-3 text-left text-label transition-colors",
        current ? "bg-primary-soft font-semibold text-text" : "text-text-secondary hover:bg-surface-soft",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      {Boolean(count) && <CountBadge tone="primary">{count}</CountBadge>}
    </button>
  );
}
