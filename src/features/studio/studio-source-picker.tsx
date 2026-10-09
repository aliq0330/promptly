"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { fieldInputClassName } from "@/components/ui/field";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealGenerators } from "@/features/generators/real-generators-provider";
import { searchGenerators } from "@/lib/supabase/generators";
import { searchPrompts } from "@/lib/supabase/prompts";
import { contentTypeLabelKey, taxonomyLabel } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Generator, Prompt } from "@/types";

export type SourcePickerKind = "prompt" | "generator";

interface Row {
  /** Prompt id or generator slug — what goes into the Studio URL. */
  key: string;
  title: string;
  author: string;
  typeLabel: string;
  image: string | null;
}

function fromPrompt(p: Prompt): Row {
  return { key: p.id, title: p.title, author: p.author.displayName, typeLabel: contentTypeLabelKey(p.contentType), image: p.media[0]?.url ?? null };
}

function fromGenerator(g: Generator): Row {
  return { key: g.slug, title: g.title, author: g.creator.displayName, typeLabel: contentTypeLabelKey(g.contentType), image: g.coverUrl };
}

/**
 * "Prompt seç" / "Generator seç" in Studio: the recent items Promptly already
 * has in memory, or a title/description search. Picking only returns the
 * key; the page loads the source itself (same path as a `?prompt=` link).
 */
export function StudioSourcePicker({ kind, onPick, onClose }: { kind: SourcePickerKind; onPick: (key: string) => void; onClose: () => void }) {
  const { t, language } = useTranslation();
  const { realPrompts } = useRealPrompts();
  const { realGenerators } = useRealGenerators();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the query is cleared
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const rows = kind === "prompt" ? (await searchPrompts(text, {}, 30)).map(fromPrompt) : (await searchGenerators(text, {}, 30)).map(fromGenerator);
      if (cancelled) return;
      setResults(rows);
      setSearching(false);
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, kind]);

  const recent = useMemo(
    () => (kind === "prompt" ? realPrompts.filter((p) => !p.deletedAt).slice(0, 30).map(fromPrompt) : realGenerators.slice(0, 30).map(fromGenerator)),
    [kind, realPrompts, realGenerators],
  );
  const rows = results ?? recent;
  const titleKey = kind === "prompt" ? "studio.pickPrompt" : "studio.pickGenerator";

  return (
    <Modal onClose={onClose} labelledBy="studio-source-picker-title">
      <div
        role="document"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-pop"
      >
        <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
          <h2 id="studio-source-picker-title" className="min-w-0 flex-1 text-h3 font-semibold text-text">
            {t(titleKey)}
          </h2>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="relative">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(kind === "prompt" ? "studio.searchPrompt" : "studio.searchGenerator")}
              autoFocus
              className={`${fieldInputClassName} pl-9`}
            />
          </div>
          {searching && <p className="text-caption text-text-muted">{t("studio.searching")}</p>}
          {!searching && rows.length === 0 && <p className="rounded-lg border border-dashed border-border bg-surface-soft p-4 text-small text-text-muted">{t("studio.noResults")}</p>}
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => onPick(row.key)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border-soft bg-background p-2 text-left hover:border-border-strong hover:bg-surface-soft"
                >
                  {row.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail
                    <img src={row.image} alt="" className="h-10 w-10 shrink-0 rounded-md bg-surface-soft object-cover" />
                  ) : (
                    <span aria-hidden className="h-10 w-10 shrink-0 rounded-md bg-surface-soft" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium text-text">{row.title}</span>
                    <span className="block truncate text-caption text-text-muted">
                      {row.author} · {taxonomyLabel(row.typeLabel, language)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
