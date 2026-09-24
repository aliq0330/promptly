"use client";

import { useMemo } from "react";
import Link from "next/link";
import { promptHref } from "@/lib/utils";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { useRealPrompts } from "./real-prompts-provider";
import type { Prompt } from "@/types";

/**
 * "Benzer promptlar" — ranked from the already-loaded shared prompt cache
 * (no new API): shared tags weigh most, same author and same content type
 * add a little. Renders nothing when there's nothing genuinely related.
 */
export function RelatedPrompts({ prompt, limit = 4 }: { prompt: Prompt; limit?: number }) {
  const { realPrompts } = useRealPrompts();

  const related = useMemo(() => {
    const tagSet = new Set(prompt.tags.map((tag) => tag.slug));
    return realPrompts
      .filter((candidate) => candidate.id !== prompt.id)
      .map((candidate) => {
        const sharedTags = candidate.tags.filter((tag) => tagSet.has(tag.slug)).length;
        const score =
          sharedTags * 3 +
          (candidate.author.id === prompt.author.id ? 1 : 0) +
          (candidate.contentType === prompt.contentType ? 1 : 0);
        return { candidate, score };
      })
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score || b.candidate.likeCount - a.candidate.likeCount)
      .slice(0, limit)
      .map(({ candidate }) => candidate);
  }, [realPrompts, prompt, limit]);

  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-prompts-title" className="space-y-2">
      <h2 id="related-prompts-title" className="px-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
        Benzer promptlar
      </h2>
      <ul className="divide-y divide-border-soft overflow-hidden rounded-lg border border-border-soft bg-surface">
        {related.map((item) => {
          const meta = CONTENT_TYPE_META[item.contentType];
          const Icon = meta.icon;
          return (
            <li key={item.id}>
              <Link href={promptHref(item)} className="flex items-start gap-3 px-3.5 py-3 transition-colors duration-200 hover:bg-surface-soft">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
                  <Icon size={14} />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="line-clamp-2 text-label font-semibold text-text">{item.title}</span>
                  <span className="mt-0.5 block truncate text-caption text-text-muted">
                    {meta.label} · {item.author.displayName}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
