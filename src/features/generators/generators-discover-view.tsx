"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Blocks, Copy, Plus, Search, SlidersHorizontal, SquareMousePointer } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { GENERATOR_CATEGORY_TOPIC_ICONS, GENERATOR_CATEGORY_TOPIC_LABELS, GENERATOR_CATEGORY_TOPICS } from "./generator-category-meta";
import { useRealGenerators } from "./real-generators-provider";
import { searchGenerators } from "@/lib/supabase/generators";
import type { Generator, GeneratorCategoryTopic } from "@/types";

type CategoryFilter = "all" | GeneratorCategoryTopic;

const STEPS = [
  { icon: SquareMousePointer, title: "Bir generator seç", body: "Karakter, ürün, kod, metin…" },
  { icon: SlidersHorizontal, title: "Parametreleri ayarla", body: "Alanları doldur, seçimleri yap." },
  { icon: Copy, title: "Promptu kopyala veya paylaş", body: "Yapılandırılmış çıktıyı kullan." },
];

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
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow="Generatorlar"
        icon={Blocks}
        title="Yapılandırılmış prompt oluştur"
        description="Generatorlar, parametre seçerek tutarlı promptlar kurmanı sağlar. Birini kullan ya da kendi generatorunu oluşturup toplulukla paylaş."
        actions={
          <Link href="/generators/create" className={buttonClassName({ size: "sm" })}>
            <Plus size={15} />
            Generator oluştur
          </Link>
        }
      />

      <ol className="grid grid-cols-3 gap-2" aria-label="Nasıl çalışır">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col items-start gap-2 rounded-lg border border-border-soft bg-surface p-2.5 sm:flex-row sm:gap-3 sm:p-3.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <step.icon size={16} strokeWidth={2} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-caption font-semibold text-text-muted">Adım {index + 1}</span>
              <span className="block text-caption font-semibold text-text sm:text-label">{step.title}</span>
              <span className="mt-0.5 hidden text-caption text-text-muted sm:block">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="space-y-3">
        <div className="relative">
          <label htmlFor="generator-search" className="sr-only">
            Generator ara
          </label>
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            id="generator-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Generator ara..."
            className="h-11 w-full rounded-md border border-border-soft bg-surface pl-10 pr-3 text-small text-text shadow-card placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <ChipRow>
          <Chip selected={category === "all"} onClick={() => setCategory("all")}>
            Tümü
          </Chip>
          {GENERATOR_CATEGORY_TOPICS.map((topic) => (
            <Chip key={topic} icon={GENERATOR_CATEGORY_TOPIC_ICONS[topic]} selected={category === topic} onClick={() => setCategory(topic)}>
              {GENERATOR_CATEGORY_TOPIC_LABELS[topic]}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {searching ? (
        <PromptCardSkeletonGrid count={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title={query.trim() ? "Eşleşen bir generator bulunamadı." : "Henüz hiç generator yayınlanmadı."}
          description={query.trim() ? "Farklı bir kelime ya da kategori dene." : "İlk generatoru sen oluştur — parametreleri sen belirle."}
          action={query.trim() ? undefined : { label: "Generator oluştur", href: "/generators/create" }}
        />
      ) : (
        <PromptGrid generators={filtered} />
      )}
    </PageContainer>
  );
}
