"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { RequestList } from "@/features/requests/request-list";
import { TaxonomyFilter } from "@/features/content/taxonomy-filter";
import { SmartSearchInput } from "./smart-search-input";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { searchPrompts } from "@/lib/supabase/prompts";
import { fetchProfileByUsername, searchProfiles } from "@/lib/supabase/profiles";
import { searchRequests } from "@/lib/supabase/requests";
import { searchGenerators } from "@/lib/supabase/generators";
import { useTranslation } from "@/lib/i18n/language-provider";
import { parseTaxonomyQuery, taxonomyPathLabel, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { formatCount, profileHref, tagHref } from "@/lib/utils";
import type { Generator, Prompt, PromptRequest, Tag, UserProfile } from "@/types";

const DEBOUNCE_MS = 300;

/** Words in the query that name a real user: `@handle`, or a bare word equal to a found username. */
function pickAuthor(words: string[], found: UserProfile[]): { author: UserProfile | null; consumed: string | null } {
  for (const word of words) {
    const handle = word.startsWith("@") ? word.slice(1).toLowerCase() : word.toLowerCase();
    const match = found.find((u) => u.username.toLowerCase() === handle);
    if (match) return { author: match, consumed: word };
  }
  return { author: null, consumed: null };
}

export function SearchView() {
  const { t, language } = useTranslation();
  const { catalog: tagCatalog } = useTagCatalog();
  const [query, setQuery] = useState("");
  const [manualFilter, setManualFilter] = useState<TaxonomyFilterValue | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [requests, setRequests] = useState<PromptRequest[]>([]);
  const [author, setAuthor] = useState<UserProfile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const normalized = query.trim();

  // "aliq03 görsel anime" -> type + subcategory are read from the words; what
  // is left is text / a username. A filter picked by hand overrides the
  // reading until the query changes again.
  const parsed = useMemo(() => parseTaxonomyQuery(normalized), [normalized]);
  const taxonomy: TaxonomyFilterValue = manualFilter ?? {
    contentType: parsed.contentType,
    category: parsed.category,
    subcategory: parsed.subcategory,
  };
  const hasTaxonomy = Boolean(taxonomy.contentType);
  // A manual filter keeps the taxonomy words out of the text search — except "All", which gives them back.
  const restText = manualFilter && !manualFilter.contentType ? normalized : parsed.rest;

  // Prefill from `?q=` (the Explore page's search box hands off here).
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL on mount
    if (initial) setQuery(initial);
  }, []);

  // Real, case-insensitive tag search — CLAUDE.md §16. Matches against the
  // already-loaded real catalog (same shared cache the tag picker/discovery
  // page use), client-side, so it stays correctly Turkish-case-aware
  // without depending on Postgres ILIKE's locale-dependent casing.
  const matchedTags: Tag[] =
    restText && !hasTaxonomy
      ? tagCatalog.filter((tag) => normalizeTagLabel(tag.label).includes(normalizeTagLabel(restText))).slice(0, 6)
      : [];

  useEffect(() => {
    if (!normalized) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears results when the query is emptied
      setPrompts([]);
      setUsers([]);
      setGenerators([]);
      setRequests([]);
      setAuthor(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const words = restText.split(/\s+/).filter(Boolean);
      const foundUsers = restText ? await searchProfiles(restText) : [];
      // A bare/`@` word that is exactly a username becomes an author filter
      // (only worth doing once a taxonomy level is present or it is an @handle).
      let { author: matchedAuthor, consumed } = pickAuthor(words, foundUsers);
      if (!matchedAuthor) {
        const handleWord = words.find((w) => w.startsWith("@") && w.length > 1);
        if (handleWord) {
          matchedAuthor = await fetchProfileByUsername(handleWord.slice(1));
          consumed = matchedAuthor ? handleWord : null;
        }
      }
      // Without a taxonomy word, a matching username is just a user result
      // (shown in the Users list) — only `@handle` or type+user narrows.
      const narrowByAuthor = Boolean(matchedAuthor) && (hasTaxonomy || words.some((w) => w.startsWith("@")));
      const author = narrowByAuthor ? matchedAuthor : null;
      const textWords = author && consumed ? words.filter((w) => w !== consumed) : words;
      const text = textWords.join(" ");
      const filters = { taxonomy, authorId: author?.id };
      const [foundPrompts, foundGenerators, foundRequests] = await Promise.all([
        searchPrompts(text, filters),
        searchGenerators(text, filters),
        searchRequests(text, filters),
      ]);
      if (cancelled) return;
      setAuthor(author);
      setUsers(author || hasTaxonomy ? [] : foundUsers);
      setPrompts(foundPrompts);
      setGenerators(foundGenerators);
      setRequests(foundRequests);
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- taxonomy is derived from the same inputs listed here
  }, [normalized, restText, hasTaxonomy, taxonomy.contentType, taxonomy.category, taxonomy.subcategory]);

  const nothingFound =
    prompts.length === 0 && users.length === 0 && matchedTags.length === 0 && generators.length === 0 && requests.length === 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="space-y-3">
        <SmartSearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setManualFilter(null);
          }}
          placeholder={t("search.placeholder")}
          autoFocus
        />
        {normalized && (
          <TaxonomyFilter value={taxonomy} onChange={setManualFilter} />
        )}
        {normalized && (author || hasTaxonomy) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted" aria-live="polite">
            <span className="font-semibold uppercase tracking-[0.08em]">{t("taxonomy.interpretedAs")}</span>
            {author && (
              <span className="text-text">
                {t("taxonomy.byUser")}: <span className="font-semibold">@{author.username}</span>
              </span>
            )}
            {hasTaxonomy && taxonomy.contentType && (
              <span className="text-text">
                {taxonomyPathLabel({ contentType: taxonomy.contentType, category: taxonomy.category, subcategory: taxonomy.subcategory }, language)}
              </span>
            )}
          </p>
        )}
      </div>

      {!normalized ? (
        <p className="py-10 text-center text-sm text-text-muted">
          {t("search.startTyping")}
        </p>
      ) : isSearching ? (
        <p className="py-10 text-center text-sm text-text-muted">{t("search.searching")}</p>
      ) : (
        <div className="space-y-8">
          {matchedTags.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-h3 font-semibold text-text">{t("nav.tags")}</h2>
              <div className="flex flex-wrap gap-2">
                {matchedTags.map((tag) => (
                  <Link key={tag.slug} href={tagHref(tag)}>
                    <Badge variant="default" className="hover:bg-accent-surface/70">
                      # {tag.label}
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {users.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-h3 font-semibold text-text">{t("search.usersHeading")}</h2>
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                {users.map((user) => (
                  <Link
                    key={user.id}
                    href={profileHref(user)}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent-surface/40"
                  >
                    <Avatar src={user.avatarUrl} alt={user.displayName} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{user.displayName}</p>
                      <p className="truncate text-xs text-text-muted">
                        @{user.username} · {formatCount(user.followerCount)} {t("profile.followersSuffix")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {generators.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-h3 font-semibold text-text">{t("nav.generators")}</h2>
              <PromptGrid generators={generators} />
            </section>
          )}

          {requests.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-h3 font-semibold text-text">{t("search.requestsHeading")}</h2>
              <RequestList requests={requests} />
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-h3 font-semibold text-text">{t("feed.filterPrompts")}</h2>
            {nothingFound ? (
              <p className="py-6 text-center text-sm text-text-muted">{t("common.noResults")}</p>
            ) : (
              <PromptGrid prompts={prompts} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
