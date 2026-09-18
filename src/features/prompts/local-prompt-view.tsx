"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PromptDetailView } from "./prompt-detail-view";
import { useLocalPrompts } from "./local-prompts-provider";

/**
 * Client-rendered counterpart to `/prompts/[id]` for prompts that exist
 * only in this browser (request answers — see local-prompts-provider.tsx).
 * Reads the prompt id from a query string instead of a path segment
 * because this is a fully static export: `/prompts/[id]` only serves the
 * exact ids baked in at build time (`generateStaticParams`), so a
 * runtime-created id has no page to land on there. A static, parameter-free
 * route like this one always exists as a real file after `next build` and
 * can look the id up client-side instead.
 */
export function LocalPromptView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { getById } = useLocalPrompts();
  const prompt = id ? getById(id) : undefined;

  if (!prompt) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Prompt bulunamadı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bu bağlantı başka bir tarayıcıda oluşturulmuş olabilir — yerel promptlar yalnızca
          oluşturuldukları tarayıcıda görünür (bkz. CLAUDE.md).
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
