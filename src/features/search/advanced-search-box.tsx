"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Hash, Search, Wrench, X, User as UserIcon, Layers } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { CONTENT_TYPE_IDS } from "@/lib/content-taxonomy";
import { AI_TOOLS, findTool, searchTools } from "@/lib/ai-tool-catalog";
import { searchProfiles } from "@/lib/supabase/profiles";
import { searchTags } from "@/lib/supabase/tags";
import { useTranslation } from "@/lib/i18n/language-provider";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";
import { tokenKey, type ContentKind, type SearchToken } from "./search-tokens";

const DEBOUNCE_MS = 250;
const KIND_LABEL: Record<ContentKind, TranslationKey> = {
  prompt: "search.kindPrompt",
  request: "request.title",
  generator: "generator.singular",
  workflow: "workflow.singular",
};
const GROUP_LABEL: Record<SearchToken["kind"], TranslationKey> = {
  user: "search.groupUsers",
  tag: "search.groupTags",
  media: "search.groupMedia",
  content: "search.groupKind",
  tool: "search.groupTools",
};
const GROUP_ORDER: SearchToken["kind"][] = ["user", "tag", "media", "content", "tool"];

/**
 * Chip/token search box: users, tags (only real ones), media type, content
 * type (prompt / request / generator / workflow) and tools are picked from live
 * suggestions and become removable chips; free text keeps working next to
 * them. The box never closes on a pick — the query keeps growing.
 */
export function AdvancedSearchBox({
  tokens,
  onTokensChange,
  text,
  onTextChange,
  autoFocus,
}: {
  tokens: SearchToken[];
  onTokensChange: (next: SearchToken[]) => void;
  text: string;
  onTextChange: (next: string) => void;
  autoFocus?: boolean;
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

  const items = useMemo<SearchToken[]>(() => {
    const q = normalizeTagLabel(word.replace(/^[@#]/, ""));
    const matches = (label: string) => !q || normalizeTagLabel(label).includes(q);
    const out: SearchToken[] = [];
    if (!word.startsWith("#")) users.forEach((user) => out.push({ kind: "user", user }));
    if (!word.startsWith("@")) tags.forEach((tag) => out.push({ kind: "tag", tag }));
    if (!word.startsWith("@") && !word.startsWith("#")) {
      CONTENT_TYPE_IDS.filter((type) => matches(t(CONTENT_TYPE_META[type].labelKey))).forEach((type) => out.push({ kind: "media", type }));
      (["prompt", "request", "generator", "workflow"] as ContentKind[])
        .filter((kind) => matches(t(KIND_LABEL[kind])))
        .forEach((kind) => out.push({ kind: "content", type: kind }));
      if (word) searchTools(AI_TOOLS.filter((tool) => tool.isActive), word).slice(0, 4).forEach((tool) => out.push({ kind: "tool", toolId: tool.id }));
    }
    return out
      .filter((token) => !selected.has(tokenKey(token)))
      .sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind));
  }, [word, users, tags, selected, t]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

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
    if (!items.length) {
      if (event.key === "Enter") event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && active >= 0) addToken(items[active]);
    }
  }

  function chipLabel(token: SearchToken): { icon: React.ReactNode; label: string } {
    switch (token.kind) {
      case "user":
        return { icon: <UserIcon size={12} />, label: `@${token.user.username}` };
      case "tag":
        return { icon: <Hash size={12} />, label: token.tag.label };
      case "media": {
        const Icon = CONTENT_TYPE_META[token.type].icon;
        return { icon: <Icon size={12} />, label: t(CONTENT_TYPE_META[token.type].labelKey) };
      }
      case "content":
        return { icon: <Layers size={12} />, label: t(KIND_LABEL[token.type]) };
      case "tool":
        return { icon: <Wrench size={12} />, label: findTool(token.toolId)?.name ?? token.toolId };
    }
  }

  const showList = open && items.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <div
        role="search"
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-12 w-full flex-wrap items-center gap-1.5 rounded-lg border border-border-soft bg-surface py-1.5 pl-11 pr-3 shadow-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
      >
        <Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-text-muted" />
        {tokens.map((token, index) => {
          const { icon, label } = chipLabel(token);
          const isPending = pendingRemove && index === tokens.length - 1;
          return (
            <span
              key={tokenKey(token)}
              className={cn(
                "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-primary-soft pl-2.5 pr-1 text-label font-medium text-text",
                isPending && "ring-2 ring-primary",
              )}
            >
              <span className="text-text-muted">{icon}</span>
              <span className="truncate">{label}</span>
              <button
                type="button"
                aria-label={`${t("search.removeFilter")}: ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  removeToken(tokenKey(token));
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text"
              >
                <X size={13} />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={t("search.placeholder")}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => {
            onTextChange(event.target.value);
            setOpen(true);
            setActive(-1);
            setPendingRemove(false);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={tokens.length ? t("search.chipPlaceholder") : t("search.placeholder")}
          className="h-8 min-w-[9rem] flex-1 bg-transparent text-small text-text placeholder:text-text-muted focus:outline-none"
        />
        {(tokens.length > 0 || text) && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTokensChange([]);
              onTextChange("");
              setPendingRemove(false);
              inputRef.current?.focus();
            }}
            className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-label font-medium text-text-muted hover:text-text"
          >
            <X size={13} />
            {t("search.clear")}
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("taxonomy.suggestionsAriaLabel")}
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-border-soft bg-surface-elevated p-1 shadow-pop animate-pop-in"
        >
          {items.map((token, index) => {
            const showHeading = index === 0 || items[index - 1].kind !== token.kind;
            const { icon, label } = chipLabel(token);
            return (
              <li key={tokenKey(token)} role="presentation">
                {showHeading && (
                  <p className="px-2.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                    {t(GROUP_LABEL[token.kind])}
                  </p>
                )}
                <button
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addToken(token)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-label text-text transition-colors",
                    index === active ? "bg-surface-soft" : "hover:bg-surface-soft",
                  )}
                >
                  {token.kind === "user" ? (
                    <>
                      <Avatar src={token.user.avatarUrl} alt={token.user.displayName} size={24} />
                      <span className="truncate">@{token.user.username}</span>
                      <span className="truncate text-caption text-text-muted">{token.user.displayName}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-text-muted">{icon}</span>
                      <span className="truncate">{token.kind === "tag" ? `#${token.tag.label}` : label}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
