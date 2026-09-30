"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Chip, ChipRow } from "@/components/ui/chip";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { RequestList } from "@/features/requests/request-list";
import { TaxonomyFilter } from "@/features/content/taxonomy-filter";
import { AdvancedSearchBox } from "./advanced-search-box";
import { tokensToQuery, type SearchToken } from "./search-tokens";
import { searchPrompts } from "@/lib/supabase/prompts";
import { searchProfiles } from "@/lib/supabase/profiles";
import { searchRequests } from "@/lib/supabase/requests";
import { searchGenerators } from "@/lib/supabase/generators";
import { searchTags } from "@/lib/supabase/tags";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TaxonomyFilterValue } from "@/lib/content-taxonomy";
import type { ContentSearchFilters } from "@/lib/supabase/taxonomy-query";
import { formatCount, profileHref, tagHref } from "@/lib/utils";
import type { Generator, Prompt, PromptRequest, Tag, UserProfile } from "@/types";

const DEBOUNCE_MS = 300;
type Sort = NonNullable<ContentSearchFilters["sort"]>;

export function SearchView() {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<SearchToken[]>([]);
  const [text, setText] = useState("");
  const [sort, setSort] = useState<Sort>("relevant");
  // Category/subcategory only make sense under a single media type chip.
  const [subFilter, setSubFilter] = useState<{ category: string | null; subcategory: string | null }>({ category: null, subcategory: null });
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [requests, setRequests] = useState<PromptRequest[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const normalized = text.trim();
  const hasTokens = tokens.length > 0;
  const active = hasTokens || Boolean(normalized);

  const { filters: tokenFilters, kinds } = useMemo(() => tokensToQuery(tokens), [tokens]);
  const singleMedia = tokenFilters.contentTypes?.length === 1 ? tokenFilters.contentTypes[0] : null;
  const category = singleMedia ? subFilter.category : null;
  const subcategory = singleMedia ? subFilter.subcategory : null;
  const filterKey = JSON.stringify([tokenFilters, kinds, category, subcategory, sort]);

  // Prefill from `?q=` (the Explore page's search box hands off here).
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL on mount
    if (initial) setText(initial);
  }, []);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears results when the query is emptied
      setPrompts([]);
      setUsers([]);
      setTags([]);
      setGenerators([]);
      setRequests([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const filters: ContentSearchFilters = {
        ...tokenFilters,
        taxonomy: singleMedia ? { contentType: singleMedia, category, subcategory } : undefined,
        sort,
      };
      // Plain text only (no chips): people and tags are results too.
      const textOnly = !hasTokens;
      const [foundPrompts, foundGenerators, foundRequests, foundUsers, foundTags] = await Promise.all([
        kinds.includes("prompt") ? searchPrompts(normalized, filters) : [],
        kinds.includes("generator") ? searchGenerators(normalized, filters) : [],
        kinds.includes("request") ? searchRequests(normalized, filters) : [],
        textOnly ? searchProfiles(normalized) : [],
        textOnly ? searchTags(normalized, 6) : [],
      ]);
      if (cancelled) return;
      setPrompts(foundPrompts);
      setGenerators(foundGenerators);
      setRequests(foundRequests);
      setUsers(foundUsers);
      setTags(foundTags);
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey captures every filter input
  }, [normalized, filterKey, active]);

  const nothingFound =
    prompts.length === 0 && users.length === 0 && tags.length === 0 && generators.length === 0 && requests.length === 0;
  const taxonomy: TaxonomyFilterValue = { contentType: singleMedia, category, subcategory };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="space-y-3">
        <AdvancedSearchBox tokens={tokens} onTokensChange={setTokens} text={text} onTextChange={setText} autoFocus />
        {singleMedia && (
          <TaxonomyFilter
            value={taxonomy}
            onChange={(next) => {
              if (!next.contentType) {
                setTokens(tokens.filter((token) => token.kind !== "media"));
                setSubFilter({ category: null, subcategory: null });
              } else {
                setSubFilter({ category: next.category, subcategory: next.subcategory });
                if (next.contentType !== singleMedia) {
                  setTokens([...tokens.filter((token) => token.kind !== "media"), { kind: "media", type: next.contentType }]);
                }
              }
            }}
          />
        )}
        {active && (
          <ChipRow>
            {(["relevant", "new", "popular"] as Sort[]).map((value) => (
              <Chip key={value} selected={sort === value} onClick={() => setSort(value)}>
                {t(value === "relevant" ? "search.sortRelevant" : value === "new" ? "search.sortNew" : "search.sortPopular")}
              </Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {!active ? (
        <p className="py-10 text-center text-sm text-text-muted">
          {t("search.startTyping")}
        </p>
      ) : isSearching ? (
        <p className="py-10 text-center text-sm text-text-muted">{t("search.searching")}</p>
      ) : (
        <div className="space-y-8">
          {tags.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-h3 font-semibold text-text">{t("nav.tags")}</h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
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

          {prompts.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-h3 font-semibold text-text">{t("feed.filterPrompts")}</h2>
              <PromptGrid prompts={prompts} />
            </section>
          )}
          {nothingFound && (
            <p className="py-6 text-center text-sm text-text-muted">
              {hasTokens ? t("search.noMatchingFilters") : t("common.noResults")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
