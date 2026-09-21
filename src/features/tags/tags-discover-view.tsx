"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Hash, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchAllTagsWithStats, fetchPopularTags, fetchTrendingTags, type TrendingTag } from "@/lib/supabase/tags";
import { formatCount, tagHref } from "@/lib/utils";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import type { Tag } from "@/types";

type SortMode = "popular" | "newest" | "az";

/**
 * `/tags` — the tag discovery page (CLAUDE.md §14): search, genuinely
 * usage-sorted popular tags, genuinely time-windowed rising tags (only
 * rendered when there's real recent data — never a fabricated trend),
 * newly-added tags, and the full catalog with search/sort.
 */
export function TagsDiscoverView() {
  const [popular, setPopular] = useState<Tag[]>([]);
  const [trending, setTrending] = useState<TrendingTag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("popular");

  useEffect(() => {
    Promise.all([fetchPopularTags(12), fetchTrendingTags(12), fetchAllTagsWithStats()]).then(
      ([popularTags, trendingTags, all]) => {
        setPopular(popularTags);
        setTrending(trendingTags);
        setAllTags(all);
        setLoaded(true);
      },
    );
  }, []);

  const normalizedQuery = normalizeTagLabel(query);
  const newest = useMemo(
    () => [...allTags].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()).slice(0, 12),
    [allTags],
  );

  const filteredAll = useMemo(() => {
    const base = normalizedQuery
      ? allTags.filter((tag) => normalizeTagLabel(tag.label).includes(normalizedQuery))
      : allTags;
    const sorted = [...base];
    if (sortMode === "popular") sorted.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0));
    else if (sortMode === "newest") sorted.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    else sorted.sort((a, b) => a.label.localeCompare(b.label, "tr"));
    return sorted;
  }, [allTags, normalizedQuery, sortMode]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 lg:px-6">
      <div>
        <h1 className="mb-1 text-lg font-semibold text-text">Etiketleri Keşfet</h1>
        <p className="text-sm text-text-muted">
          Popüler ve yükselen etiketleri incele, ya da doğrudan aradığın etikete git.
        </p>
      </div>

      <div className="flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-3">
        <Search size={18} className="shrink-0 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Etiket ara..."
          className="h-full w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
        />
      </div>

      {!loaded ? (
        <p className="py-10 text-center text-sm text-text-muted">Yükleniyor…</p>
      ) : normalizedQuery ? (
        <TagResultsSection title={`"${query.trim()}" için sonuçlar`} tags={filteredAll} emptyMessage="Eşleşen etiket bulunamadı." />
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Flame size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-text">Popüler Etiketler</h2>
            </div>
            <TagChipRow tags={popular} emptyMessage="Henüz yeterli kullanım verisi yok." />
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-text">Yükselen Etiketler</h2>
            </div>
            {trending.length === 0 ? (
              <p className="text-sm text-text-muted">
                Son dönemde yükselen bir etiket için henüz yeterli gerçek veri yok.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {trending.map((tag) => (
                  <Link key={tag.slug} href={tagHref(tag)}>
                    <Badge variant="default" className="hover:bg-accent-surface/70">
                      #{tag.label} <span className="ml-1 text-primary/70">+{tag.recentCount}</span>
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Hash size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-text">Yeni Eklenenler</h2>
            </div>
            <TagChipRow tags={newest} emptyMessage="Henüz yeni bir etiket yok." />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text">Tüm Etiketler ({allTags.length})</h2>
              <div className="flex gap-1.5">
                {(["popular", "newest", "az"] as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSortMode(mode)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      sortMode === mode
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-text-muted hover:text-text"
                    }`}
                  >
                    {mode === "popular" ? "Popüler" : mode === "newest" ? "En Yeni" : "A-Z"}
                  </button>
                ))}
              </div>
            </div>
            <TagResultsSection tags={filteredAll} emptyMessage="Henüz hiç etiket yok." />
          </section>
        </>
      )}
    </div>
  );
}

function TagChipRow({ tags, emptyMessage }: { tags: Tag[]; emptyMessage: string }) {
  if (tags.length === 0) return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Link key={tag.slug} href={tagHref(tag)}>
          <Badge variant="outline" className="hover:bg-accent-surface">
            #{tag.label}
          </Badge>
        </Link>
      ))}
    </div>
  );
}

function TagResultsSection({ title, tags, emptyMessage }: { title?: string; tags: Tag[]; emptyMessage: string }) {
  return (
    <div className="space-y-3">
      {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
      {tags.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">{emptyMessage}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {tags.map((tag) => (
            <Link
              key={tag.slug}
              href={tagHref(tag)}
              className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent-surface/40"
            >
              <span className="text-sm font-medium text-text">#{tag.label}</span>
              <span className="text-xs text-text-muted">
                {formatCount(tag.usageCount ?? 0)} kullanım
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
