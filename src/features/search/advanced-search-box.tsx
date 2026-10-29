"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Clock, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ScrollRow } from "@/components/ui/scroll-row";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { CONTENT_TYPE_IDS } from "@/lib/content-taxonomy";
import { AI_TOOLS, searchTools } from "@/lib/ai-tool-catalog";
import { searchProfiles } from "@/lib/supabase/profiles";
import { fetchPopularTags, searchTags } from "@/lib/supabase/tags";
import { useTranslation } from "@/lib/i18n/language-provider";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";
import { KIND_LABEL, tokenChip } from "./search-chip-meta";
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

/** Popular tags are the same for everyone: fetched once per page load, only when the empty box is first focused. */
let popularTagsCache: Tag[] | null = null;

/**
 * Search box: ONE text row, the chips under it in a single scrolling strip (never wrapping into the box). Users, tags (only real ones),
 * media type, content type and tools are picked from live suggestions — or from the Filtre sheet (`SearchFilterSections`) — and become
 * removable chips; free text keeps working next to them. Typing `@` / `#` narrows the list to people / tags and Enter takes the first one.
 * An empty, focused box offers recent searches and popular tags. The box never closes on a pick — the query keeps growing.
 */
export function AdvancedSearchBox({
  tokens,
  onTokensChange,
  text,
  onTextChange,
  autoFocus,
  hideKindSuggestions,
  placeholder,
}: {
  tokens: SearchToken[];
  onTokensChange: (next: SearchToken[]) => void;
  text: string;
  onTextChange: (next: string) => void;
  autoFocus?: boolean;
  /** Single-type list pages: the content-type (prompt/request/…) chips are pointless there. */
  hideKindSuggestions?: boolean;
  /** Page-specific placeholder ("Workflow ara"…); defaults to the site-wide one. */
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-list`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pendingRemove, setPendingRemove] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [popular, setPopular] = useState<Tag[]>(popularTagsCache ?? []);
  const word = text.trim();

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
        (hideKindSuggestions ? [] : (["prompt", "request", "workflow", "preset"] as ContentKind[]))
          .filter((kind) => matches(t(KIND_LABEL[kind])))
          .forEach((kind) => add({ kind: "content", type: kind }));
        searchTools(AI_TOOLS.filter((tool) => tool.isActive), word).slice(0, 4).forEach((tool) => add({ kind: "tool", toolId: tool.id }));
      }
    }
    return out
      .filter((entry) => !entry.token || !selected.has(tokenKey(entry.token)))
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [word, users, tags, recents, popular, selected, t, hideKindSuggestions]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  /** What an EMPTY box offers: recent searches (this browser) and the popular tags (fetched once per page load). */
  function loadEmptySources() {
    setRecents(readRecentSearches());
    if (popularTagsCache) return;
    void fetchPopularTags(6).then((found) => {
      popularTagsCache = found;
      setPopular(found);
    });
  }
  function openList() {
    setOpen(true);
    loadEmptySources();
  }

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
  function pick(entry: Entry) {
    if (entry.token) {
      addToken(entry.token);
    } else if (entry.recent) {
      onTextChange(entry.recent);
      rememberSearch(entry.recent);
      setOpen(false);
      setActive(-1);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && text === "" && tokens.length > 0) {
      event.preventDefault();
      if (pendingRemove) removeToken(tokenKey(tokens[tokens.length - 1]));
      else setPendingRemove(true);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (open && active >= 0 && entries[active]) pick(entries[active]);
      // "@" / "#" = "I want a person / tag": Enter takes the first suggestion without arrowing down to it.
      else if (/^[@#]/.test(word) && entries.length > 0) pick(entries[0]);
      else {
        rememberSearch(word);
        setOpen(false);
      }
      return;
    }
    if (!entries.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % entries.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? entries.length - 1 : i - 1));
    }
  }

  const showList = open && entries.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <div
        role="search"
        onClick={() => inputRef.current?.focus()}
        className="flex h-[3.25rem] w-full items-center rounded-[1.625rem] border border-transparent bg-surface-soft pl-12 pr-1.5 transition-colors focus-within:border-primary focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/20"
      >
        <Search size={19} className="pointer-events-none absolute left-4 top-[1.0625rem] text-text-muted" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={placeholder ?? t("search.placeholder")}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => {
            onTextChange(event.target.value);
            if (!event.target.value.trim()) loadEmptySources();
            setOpen(true);
            setActive(-1);
            setPendingRemove(false);
          }}
          onFocus={openList}
          onKeyDown={handleKeyDown}
          placeholder={tokens.length ? t("search.chipPlaceholder") : (placeholder ?? t("search.placeholder"))}
          className="h-full min-w-0 flex-1 bg-transparent text-small text-text placeholder:text-text-muted focus:outline-none"
        />
        {text && (
          <button
            type="button"
            aria-label={t("search.clearText")}
            onClick={(event) => {
              event.stopPropagation();
              onTextChange("");
              setPendingRemove(false);
              inputRef.current?.focus();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {tokens.length > 0 && (
        <ScrollRow role="group" aria-label={t("search.chipsAria")} wrapperClassName="mt-2.5" className="-mx-3 items-center gap-2 px-3 sm:mx-0 sm:px-0">
          {tokens.map((token, index) => {
            const { icon: Icon, label } = tokenChip(token, t);
            const isPending = pendingRemove && index === tokens.length - 1;
            return (
              <span
                key={tokenKey(token)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary-soft pl-3 pr-1 text-label font-medium whitespace-nowrap text-text",
                  isPending && "ring-2 ring-primary",
                )}
              >
                <Icon size={14} className="text-primary" aria-hidden />
                <span>{label}</span>
                <button
                  type="button"
                  aria-label={`${t("search.removeFilter")}: ${label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeToken(tokenKey(token));
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text"
                >
                  <X size={14} />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => {
              onTokensChange([]);
              onTextChange("");
              setPendingRemove(false);
              inputRef.current?.focus();
            }}
            className="inline-flex h-9 shrink-0 items-center px-2 text-label font-semibold whitespace-nowrap text-primary hover:text-primary-hover"
          >
            {t("search.clear")}
          </button>
        </ScrollRow>
      )}

      {showList && (
        <div className="absolute left-0 right-0 top-[3.5rem] z-30 flex max-h-[min(22rem,55dvh)] flex-col overflow-hidden rounded-lg border border-border-soft bg-surface-elevated shadow-pop animate-pop-in">
          <ul id={listId} role="listbox" aria-label={t("taxonomy.suggestionsAriaLabel")} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
            {entries.map((entry, index) => {
              const showHeading = index === 0 || entries[index - 1].group !== entry.group;
              const token = entry.token;
              const chip = token ? tokenChip(token, t) : null;
              const Icon = chip?.icon ?? Clock;
              return (
                <li key={entry.id} role="presentation">
                  {showHeading && (
                    <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t(GROUP_LABEL[entry.group])}</p>
                      {entry.group === "recent" && (
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            clearRecentSearches();
                            setRecents([]);
                          }}
                          className="text-caption font-medium text-text-muted hover:text-text"
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
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(entry)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-label text-text transition-colors",
                      index === active ? "bg-surface-soft" : "hover:bg-surface-soft",
                    )}
                  >
                    {token?.kind === "user" ? (
                      <>
                        <Avatar src={token.user.avatarUrl} alt={token.user.displayName} size={28} />
                        <span className="truncate">@{token.user.username}</span>
                        <span className="truncate text-caption text-text-muted">{token.user.displayName}</span>
                      </>
                    ) : (
                      <>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-soft text-text-secondary">
                          <Icon size={15} aria-hidden />
                        </span>
                        <span className="truncate">{token?.kind === "tag" ? `#${chip?.label}` : (chip?.label ?? entry.recent)}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="shrink-0 border-t border-border-soft px-3.5 py-2 text-caption text-text-muted">{t("search.suggestHint")}</p>
        </div>
      )}
    </div>
  );
}
