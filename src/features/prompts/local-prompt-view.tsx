"use client";

import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PromptDetailView } from "./prompt-detail-view";
import { useRealPrompts } from "./real-prompts-provider";
import type { Prompt } from "@/types";

/**
 * Client-rendered prompt detail — every prompt is a real Supabase row now
 * (CLAUDE.md's mock-data removal), so this looks it up client-side by a
 * `?id=` query param: a cache hit from `RealPromptsProvider`'s recent
 * batch, or a live fetch otherwise. See `promptHref()` in lib/utils.ts.
 */
export function LocalPromptView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { getCached, fetchById } = useRealPrompts();

  const cachedPrompt = id ? getCached(id) : undefined;

  const [fetchedPrompt, setFetchedPrompt] = useState<Prompt | null>(null);
  const [checkedRemote, setCheckedRemote] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!id || cachedPrompt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- already cached, nothing async to wait on
      setCheckedRemote(true);
      return;
    }

    setCheckedRemote(false);
    fetchById(id).then((prompt) => {
      if (!cancelled) {
        setFetchedPrompt(prompt);
        setCheckedRemote(true);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, Boolean(cachedPrompt)]);

  const prompt = cachedPrompt ?? fetchedPrompt ?? undefined;

  if (!prompt && !checkedRemote) {
    return <DetailSkeleton />;
  }

  if (!prompt) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">Prompt bulunamadı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bu prompt kaldırılmış olabilir, ya da hiç var olmamış olabilir.
        </p>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    );
  }

  if (prompt.deletedAt) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">Bu paylaşım silindi</h1>
        <p className="mb-4 text-sm text-text-muted">
          Yazarı bu paylaşımı sildi.
        </p>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    );
  }

  return <PromptDetailView prompt={prompt} />;
}
