"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Hash } from "lucide-react";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { RequestList } from "@/features/requests/request-list";
import { fetchPromptsByTag, fetchRequestsByTagSlug, fetchTagBySlug } from "@/lib/supabase/tags";
import { formatCount, cn } from "@/lib/utils";
import type { Prompt, PromptContentType, PromptRequest, Tag } from "@/types";

type ContentFilter = "all" | PromptContentType;
type SortMode = "newest" | "popular";

const CONTENT_FILTERS: { value: ContentFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "image", label: "Görsel" },
  { value: "text", label: "Metin" },
  { value: "video", label: "Video" },
  { value: "code", label: "Kod" },
  { value: "music", label: "Müzik" },
];

/**
 * Client-rendered counterpart to the old static `/tags/[tag]` — tags are
 * real, possibly user-created rows (CLAUDE.md Bölüm 9.23), not known at
 * build time, so this looks prompts/requests up client-side by a `?tag=`
 * slug (see `tagHref()` in lib/utils.ts). Shows the tag's real label +
 * usage stats (not the raw slug), a content-type filter, a real
 * newest/popular sort, and a requests section — a real gap fix over the
 * previous minimal version, which only ever showed prompts under the raw
 * slug as a heading.
 */
export function TagView() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("tag");
  const [tag, setTag] = useState<Tag | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [requests, setRequests] = useState<PromptRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no slug to look up, nothing async to wait on
      setLoaded(true);
      return;
    }
    setLoaded(false);
    Promise.all([fetchTagBySlug(slug), fetchPromptsByTag(slug), fetchRequestsByTagSlug(slug)]).then(
      ([foundTag, foundPrompts, foundRequests]) => {
        if (cancelled) return;
        setTag(foundTag);
        setPrompts(foundPrompts);
        setRequests(foundRequests);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const filteredPrompts = useMemo(() => {
    const filtered = contentFilter === "all" ? prompts : prompts.filter((p) => p.contentType === contentFilter);
    const sorted = [...filtered];
    if (sortMode === "popular") sorted.sort((a, b) => b.likeCount - a.likeCount);
    else sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted;
  }, [prompts, contentFilter, sortMode]);

  if (!slug) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">Etiket bulunamadı.</div>;
  }

  if (!loaded) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">Yükleniyor…</div>;
  }

  if (!tag) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Etiket bulunamadı</h1>
        <p className="text-sm text-text-muted">Bu etiket silinmiş veya hiç var olmamış olabilir.</p>
      </div>
    );
  }

  const totalCount = tag.usageCount ?? prompts.length + requests.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-6">
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <Hash size={20} className="text-primary" />
          <h1 className="text-lg font-semibold text-text">{tag.label}</h1>
        </div>
        <p className="text-sm text-text-muted">{formatCount(totalCount)} içerikte kullanıldı</p>
      </div>

      {requests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">Prompt İstekleri ({requests.length})</h2>
          <RequestList requests={requests} />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text">Promptlar ({filteredPrompts.length})</h2>
          <div className="flex gap-1.5">
            {(["newest", "popular"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  sortMode === mode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-text-muted hover:text-text",
                )}
              >
                {mode === "newest" ? "En Yeni" : "Popüler"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CONTENT_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setContentFilter(filter.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                contentFilter === filter.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-text-muted hover:text-text",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {filteredPrompts.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            {contentFilter === "all" ? "Bu etikete sahip bir prompt henüz yok." : "Bu türde, bu etikete sahip bir prompt yok."}
          </p>
        ) : (
          <PromptGrid prompts={filteredPrompts} />
        )}
      </section>

      {requests.length === 0 && prompts.length === 0 && (
        <p className="py-10 text-center text-sm text-text-muted">Bu etikete sahip içerik henüz yok.</p>
      )}
    </div>
  );
}
