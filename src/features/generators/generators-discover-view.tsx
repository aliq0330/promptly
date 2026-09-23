"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { GENERATOR_CATEGORY_TOPIC_LABELS, GENERATOR_CATEGORY_TOPICS } from "./generator-category-meta";
import { useRealGenerators } from "./real-generators-provider";
import { searchGenerators } from "@/lib/supabase/generators";
import { cn } from "@/lib/utils";
import type { Generator, GeneratorCategoryTopic } from "@/types";

type CategoryFilter = "all" | GeneratorCategoryTopic;

/**
 * `/generators` — the real generator discovery page: category filter
 * chips, search, and a "popular" ordering by default. Its base list is the
 * SAME shared `RealGeneratorsProvider` cache the home feed/Discover use
 * (Bölüm 9.36's Prompt/Generator parity pass) instead of its own separate
 * fetch.
 */
export function GeneratorsDiscoverView() {
  const { realGenerators } = useRealGenerators();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Generator[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears results when the query is emptied
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      searchGenerators(trimmed).then((results) => {
        setSearchResults(results);
        setSearching(false);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const filtered = useMemo(() => {
    const base = searchResults ?? realGenerators;
    return category === "all" ? base : base.filter((g) => g.category === category);
  }, [realGenerators, searchResults, category]);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="rounded-lg border border-border bg-accent-surface px-4 py-5 sm:px-6 sm:py-6">
        <h1 className="mb-1 text-lg font-semibold text-text sm:text-xl">Generatorları Keşfet</h1>
        <p className="text-sm text-text-muted">Başkalarının oluşturduğu prompt generatorlarını kullan, remixle ya da kendi generatorunu oluştur.</p>
      </div>

      <div className="flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-3">
        <Search size={18} className="shrink-0 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Generator ara..."
          className="h-full w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
        />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            category === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-text-muted hover:text-text",
          )}
        >
          Tümü
        </button>
        {GENERATOR_CATEGORY_TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            onClick={() => setCategory(topic)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              category === topic ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-text-muted hover:text-text",
            )}
          >
            {GENERATOR_CATEGORY_TOPIC_LABELS[topic]}
          </button>
        ))}
      </div>

      {searching ? (
        <p className="py-10 text-center text-sm text-text-muted">Yükleniyor…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-accent-surface/40 py-10 text-center text-sm text-text-muted">
          {query.trim() ? "Eşleşen bir generator bulunamadı." : "Henüz hiç generator yayınlanmadı."}
        </p>
      ) : (
        <PromptGrid generators={filtered} />
      )}
    </div>
  );
}
