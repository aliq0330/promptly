"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Hash, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { parseTaxonomyQuery, suggestTaxonomy, taxonomyLabel, taxonomyPathLabel, type TaxonomySuggestion } from "@/lib/content-taxonomy";
import { searchProfiles } from "@/lib/supabase/profiles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { cn, tagHref } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";

type Item =
  | { kind: "user"; key: string; user: UserProfile }
  | { kind: "taxonomy"; key: string; suggestion: TaxonomySuggestion }
  | { kind: "tag"; key: string; tag: Tag };

const GROUP_LABEL: Record<Item["kind"], TranslationKey> = {
  user: "taxonomy.suggestUser",
  taxonomy: "taxonomy.suggestType", // overridden per taxonomy level below
  tag: "taxonomy.suggestTag",
};

/** The word being typed = everything after the last space. */
function splitLastWord(value: string): { head: string; word: string } {
  const idx = value.lastIndexOf(" ");
  return idx === -1 ? { head: "", word: value } : { head: value.slice(0, idx + 1), word: value.slice(idx + 1) };
}

/**
 * Search box with live suggestions for the word being typed: users
 * (`@username`), content type, category, subcategory — all from the central
 * taxonomy, narrowed to a type already named in the query — and EXISTING
 * tags only (never invented). Picking a user/type/category/subcategory
 * writes it into the box so the query can keep growing
 * ("aliq03" → "@aliq03 görsel" → "@aliq03 görsel anime"); picking a tag
 * opens its page. Used by Explore and the search page.
 */
export function SmartSearchInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  id,
  autoFocus,
  className,
  submitButton,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (event: FormEvent) => void;
  placeholder: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
  /** Extra element rendered inside the field's right edge (e.g. a submit button). */
  submitButton?: ReactNode;
}) {
  const { t, language } = useTranslation();
  const { catalog } = useTagCatalog();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { head, word } = splitLastWord(value);
  const cleanWord = word.replace(/^[@#]/, "");
  const parsed = useMemo(() => parseTaxonomyQuery(head), [head]);

  // Users: debounced, only for words long enough to mean something.
  useEffect(() => {
    if (cleanWord.length < 2 || word.startsWith("#")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale suggestions when the word is too short
      setUsers([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchProfiles(cleanWord, 3).then((found) => {
        if (!cancelled) setUsers(found);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanWord, word]);

  const items = useMemo<Item[]>(() => {
    if (!cleanWord) return [];
    const out: Item[] = [];
    if (!word.startsWith("#")) users.forEach((user) => out.push({ kind: "user", key: `u-${user.id}`, user }));
    if (!word.startsWith("@") && !word.startsWith("#")) {
      suggestTaxonomy(cleanWord, language, parsed.contentType, 6).forEach((suggestion, i) =>
        out.push({ kind: "taxonomy", key: `x-${suggestion.entry.labelKey}-${i}`, suggestion }),
      );
    }
    if (!word.startsWith("@") && cleanWord.length >= 2) {
      const q = normalizeTagLabel(cleanWord);
      catalog
        .filter((tag) => normalizeTagLabel(tag.label).startsWith(q) || normalizeTagLabel(tag.label).includes(`-${q}`))
        .slice(0, 4)
        .forEach((tag) => out.push({ kind: "tag", key: `t-${tag.slug}`, tag }));
    }
    return out;
  }, [cleanWord, word, users, parsed.contentType, catalog, language]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function apply(item: Item) {
    setOpen(false);
    setActive(-1);
    if (item.kind === "user") onChange(`${head}@${item.user.username} `);
    else if (item.kind === "taxonomy") onChange(`${head}${item.suggestion.insertText} `);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === "Enter" && active >= 0) {
      const item = items[active];
      event.preventDefault();
      if (item.kind === "tag") window.location.assign(tagHref(item.tag));
      else apply(item);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function groupHeading(item: Item): string {
    if (item.kind === "taxonomy") {
      const kind = item.suggestion.entry.kind;
      return t(kind === "type" ? "taxonomy.suggestType" : kind === "category" ? "taxonomy.suggestCategory" : "taxonomy.suggestSubcategory");
    }
    return t(GROUP_LABEL[item.kind]);
  }

  const showList = open && items.length > 0;

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <form onSubmit={onSubmit} role="search" className="relative">
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-12 w-full rounded-lg border border-border-soft bg-surface pl-11 pr-24 text-small text-text shadow-card placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {submitButton}
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("taxonomy.suggestionsAriaLabel")}
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-border-soft bg-surface-elevated p-1 shadow-pop animate-pop-in"
        >
          {items.map((item, index) => {
            const showHeading = index === 0 || groupHeading(items[index - 1]) !== groupHeading(item);
            const rowClass = cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-label text-text transition-colors",
              index === active ? "bg-surface-soft" : "hover:bg-surface-soft",
            );
            return (
              <li key={item.key} role="presentation">
                {showHeading && (
                  <p className="px-2.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{groupHeading(item)}</p>
                )}
                {item.kind === "tag" ? (
                  <Link id={`${listId}-${index}`} role="option" aria-selected={index === active} href={tagHref(item.tag)} className={rowClass}>
                    <Hash size={15} className="text-text-muted" />
                    {item.tag.label}
                  </Link>
                ) : (
                  <button
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => apply(item)}
                    className={rowClass}
                  >
                    {item.kind === "user" ? (
                      <>
                        <Avatar src={item.user.avatarUrl} alt={item.user.displayName} size={22} />
                        <span className="truncate">@{item.user.username}</span>
                        <span className="truncate text-caption text-text-muted">{item.user.displayName}</span>
                      </>
                    ) : (
                      <>
                        {item.suggestion.entry.kind === "type" ? (
                          (() => {
                            const Icon = CONTENT_TYPE_META[item.suggestion.entry.type].icon;
                            return <Icon size={15} className="text-text-muted" />;
                          })()
                        ) : null}
                        <span className="truncate">{taxonomyLabel(item.suggestion.entry.labelKey, language)}</span>
                        {item.suggestion.entry.kind !== "type" && (
                          <span className="truncate text-caption text-text-muted">
                            {taxonomyPathLabel(
                              { contentType: item.suggestion.entry.type, category: item.suggestion.entry.categoryId },
                              language,
                              true,
                            )}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
