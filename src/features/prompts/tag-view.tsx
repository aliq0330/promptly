"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { fetchPromptsByTag } from "@/lib/supabase/tags";
import type { Prompt } from "@/types";

/**
 * Client-rendered counterpart to the old static `/tags/[tag]` — tags are
 * seeded rows, not known at build time, so this looks prompts up client-side
 * by a `?tag=` slug (see `tagHref()` in lib/utils.ts).
 */
export function TagView() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("tag");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no slug to look up, nothing async to wait on
      setLoaded(true);
      return;
    }
    setLoaded(false);
    fetchPromptsByTag(slug).then((result) => {
      if (!cancelled) {
        setPrompts(result);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">Etiket bulunamadı.</div>;
  }

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">#{slug}</h1>
      {!loaded ? (
        <p className="py-10 text-center text-sm text-text-muted">Yükleniyor…</p>
      ) : (
        <PromptGrid prompts={prompts} />
      )}
    </div>
  );
}
