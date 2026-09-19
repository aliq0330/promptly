"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PromptDetailView } from "./prompt-detail-view";
import { useLocalPrompts } from "./local-prompts-provider";
import { useRealPrompts } from "./real-prompts-provider";
import type { Prompt } from "@/types";

/**
 * Client-rendered counterpart to `/prompts/[id]` for any prompt id that
 * isn't one of the fixed mock ids baked into the static export at build
 * time (`generateStaticParams` only knows about mock data — see
 * `promptHref()` in lib/utils.ts). That covers two real sources, checked
 * in order:
 *   1. a prompt created locally in this browser (localStorage — request
 *      answers, remix/duplicate previews never reach this far since they
 *      stay preview-only);
 *   2. since CLAUDE.md Bölüm 21, a genuinely real prompt published to
 *      Supabase (plain "Prompt Oluştur"/"Kopyasını Oluştur" while signed
 *      in) — checked via a live fetch if it isn't already in the recent-
 *      prompts batch RealPromptsProvider loaded on mount.
 * This is a fully static export: `/prompts/[id]` only serves the exact ids
 * baked in at build time, so a runtime-created id (local or real) has no
 * page to land on there. A static, parameter-free route like this one
 * always exists as a real file after `next build` and can look the id up
 * client-side instead.
 */
export function LocalPromptView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { getById: getLocalById } = useLocalPrompts();
  const { getCached, fetchById } = useRealPrompts();

  const localPrompt = id ? getLocalById(id) : undefined;
  const cachedRealPrompt = id && !localPrompt ? getCached(id) : undefined;

  const [fetchedPrompt, setFetchedPrompt] = useState<Prompt | null>(null);
  const [checkedRemote, setCheckedRemote] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!id || localPrompt || cachedRealPrompt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- already found locally/cached, nothing async to wait on
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
  }, [id, Boolean(localPrompt), Boolean(cachedRealPrompt)]);

  const prompt = localPrompt ?? cachedRealPrompt ?? fetchedPrompt ?? undefined;

  if (!prompt && !checkedRemote) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">Yükleniyor…</div>
    );
  }

  if (!prompt) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Prompt bulunamadı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bu bağlantı başka bir tarayıcıda oluşturulmuş yerel bir prompta ait olabilir, kaldırılmış
          olabilir, ya da hiç var olmamış olabilir.
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
