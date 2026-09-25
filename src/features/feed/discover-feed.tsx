"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Blocks, Hash, LayoutGrid, Search, Sparkles, SquareTerminal, TrendingUp, Users } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedGrid } from "./feed-grid";
import { feedItemCreatedAt, type FeedItem } from "./types";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { GENERATOR_CATEGORY_TOPICS, GENERATOR_CATEGORY_TOPIC_ICONS, GENERATOR_CATEGORY_TOPIC_LABELS } from "@/features/generators/generator-category-meta";
import { CreatorCard } from "@/features/profile/creator-card";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useRealGenerators } from "@/features/generators/real-generators-provider";
import { fetchTopCreators } from "@/lib/supabase/profiles";
import { fetchPopularTags } from "@/lib/supabase/tags";
import { tagHref } from "@/lib/utils";
import type { GeneratorCategoryTopic, PromptContentType, Tag, UserProfile } from "@/types";

type Section = "all" | "prompts" | "generators" | "requests" | "creators";

const SECTIONS = [
  { key: "all" as const, label: "Tümü", icon: LayoutGrid },
  { key: "prompts" as const, label: "Promptlar", icon: SquareTerminal },
  { key: "generators" as const, label: "Generatorlar", icon: Blocks },
  { key: "requests" as const, label: "İstekler", icon: Sparkles },
  { key: "creators" as const, label: "Yaratıcılar", icon: Users },
];

const PROMPT_TYPES = Object.keys(CONTENT_TYPE_META) as PromptContentType[];

/**
 * Explore — search, trending tags, and one place to browse every kind of
 * content: all, prompts (by content type), generators (by topic), requests
 * (open / all) and creators. All filtering happens on the already-loaded
 * shared caches (RealPrompts/Requests/Generators providers), no new API.
 */
export function DiscoverFeed() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("all");
  const [promptType, setPromptType] = useState<PromptContentType | "all">("all");
  const [topic, setTopic] = useState<GeneratorCategoryTopic | "all">("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [creators, setCreators] = useState<UserProfile[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const { realPrompts, loading } = useRealPrompts();
  const { realRequests } = useRealRequests();
  const { realGenerators } = useRealGenerators();

  useEffect(() => {
    // Genuinely usage-sorted (CLAUDE.md Bölüm 9.23).
    fetchPopularTags(14).then(setTags);
    fetchTopCreators(12).then(setCreators);
  }, []);

  const items = useMemo<FeedItem[]>(() => {
    const prompts: FeedItem[] = realPrompts
      .filter((prompt) => promptType === "all" || prompt.contentType === promptType)
      .map((prompt) => ({ kind: "prompt", data: prompt }));
    const generators: FeedItem[] = realGenerators
      .filter((generator) => topic === "all" || generator.category === topic)
      .map((generator) => ({ kind: "generator", data: generator }));
    const requests: FeedItem[] = realRequests
      .filter((request) => !openOnly || request.status === "open")
      .map((request) => ({ kind: "request", data: request }));
    const pick = section === "prompts" ? prompts : section === "generators" ? generators : section === "requests" ? requests : [...prompts, ...generators, ...requests];
    return pick.sort((a, b) => feedItemCreatedAt(b) - feedItemCreatedAt(a));
  }, [realPrompts, realGenerators, realRequests, promptType, topic, openOnly, section]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} role="search" className="relative">
        <label htmlFor="discover-search" className="sr-only">
          Prompt, generator, kullanıcı veya etiket ara
        </label>
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          id="discover-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Prompt, generator, kullanıcı veya etiket ara"
          className="h-12 w-full rounded-lg border border-border-soft bg-surface pl-11 pr-24 text-small text-text shadow-card placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-md bg-text px-4 text-label font-semibold text-background transition-opacity hover:opacity-90"
        >
          Ara
        </button>
      </form>

      {tags.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="hidden shrink-0 items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted sm:flex">
            <TrendingUp size={13} />
            Trend
          </span>
          <div className="scrollbar-none -mx-3 flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:px-0">
            {tags.map((tag) => (
              <Link
                key={tag.slug}
                href={tagHref(tag)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border-soft bg-surface px-3 text-label font-medium text-text-secondary transition-colors duration-200 hover:border-primary/40 hover:text-primary"
              >
                <Hash size={13} className="text-text-muted" />
                {tag.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Tabs items={SECTIONS} active={section} onChange={setSection} ariaLabel="Keşfet bölümleri" />

        {section === "prompts" && (
          <ChipRow>
            <Chip selected={promptType === "all"} onClick={() => setPromptType("all")}>
              Tüm türler
            </Chip>
            {PROMPT_TYPES.map((type) => (
              <Chip key={type} icon={CONTENT_TYPE_META[type].icon} selected={promptType === type} onClick={() => setPromptType(type)}>
                {CONTENT_TYPE_META[type].label}
              </Chip>
            ))}
          </ChipRow>
        )}
        {section === "generators" && (
          <ChipRow>
            <Chip selected={topic === "all"} onClick={() => setTopic("all")}>
              Tüm kategoriler
            </Chip>
            {GENERATOR_CATEGORY_TOPICS.map((key) => (
              <Chip key={key} icon={GENERATOR_CATEGORY_TOPIC_ICONS[key]} selected={topic === key} onClick={() => setTopic(key)}>
                {GENERATOR_CATEGORY_TOPIC_LABELS[key]}
              </Chip>
            ))}
          </ChipRow>
        )}
        {section === "requests" && (
          <ChipRow>
            <Chip selected={!openOnly} onClick={() => setOpenOnly(false)}>
              Tüm istekler
            </Chip>
            <Chip selected={openOnly} onClick={() => setOpenOnly(true)}>
              Yalnızca açık
            </Chip>
          </ChipRow>
        )}
      </div>

      {section === "creators" ? (
        creators === null ? (
          <PromptCardSkeletonGrid count={3} />
        ) : creators.length === 0 ? (
          <EmptyState icon={Users} title="Henüz öne çıkan yaratıcı yok" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {creators.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
            ))}
          </div>
        )
      ) : loading && items.length === 0 ? (
        <PromptCardSkeletonGrid count={6} />
      ) : (
        <FeedGrid items={items} emptyTitle="Bu filtreye uyan içerik yok" emptyDescription="Başka bir tür veya kategori seçmeyi dene." />
      )}
    </div>
  );
}
