"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchPrompts } from "@/lib/supabase/prompts";
import { searchGenerators } from "@/lib/supabase/generators";
import { searchPresets } from "@/lib/supabase/presets";
import { searchWorkflows } from "@/lib/supabase/workflows";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealGenerators } from "@/features/generators/real-generators-provider";
import { useRealPresets } from "@/features/presets/real-presets-provider";
import { useRealWorkflows } from "@/features/workflows/real-workflows-provider";
import type { Generator, Preset, Prompt, Workflow } from "@/types";
import { KIND_ICONS } from "./studio-meta";
import type { StudioKind } from "./studio-model";

export type PickedItem =
  | { kind: "prompt" | "dna"; id: string; title: string; subtitle: string; prompt: Prompt }
  | { kind: "generator"; id: string; title: string; subtitle: string; generator: Generator }
  | { kind: "preset"; id: string; title: string; subtitle: string; preset: Preset }
  | { kind: "workflow"; id: string; title: string; subtitle: string; workflow: Workflow };

interface Row {
  key: string;
  item: PickedItem;
}

function rowsFor(kind: StudioKind, prompts: Prompt[], generators: Generator[], presets: Preset[], workflows: Workflow[]): Row[] {
  if (kind === "prompt" || kind === "dna") {
    return prompts.map((p) => ({ key: p.id, item: { kind, id: p.id, title: p.title, subtitle: p.author.displayName, prompt: p } }));
  }
  if (kind === "generator") return generators.map((g) => ({ key: g.id, item: { kind, id: g.slug, title: g.title, subtitle: g.creator.displayName, generator: g } }));
  if (kind === "preset") return presets.map((p) => ({ key: p.id, item: { kind, id: p.id, title: p.title, subtitle: p.creator.displayName, preset: p } }));
  return workflows.map((w) => ({ key: w.id, item: { kind, id: w.id, title: w.title, subtitle: w.creator.displayName, workflow: w } }));
}

/**
 * "+ Kaynak Ekle" — picks from the real library. Lists what the app already
 * has cached (the same providers the list pages use) and, when a query is
 * typed, calls the existing `search*` functions. No second search system.
 * `kinds` narrows the tabs (the workflow "add step" use only allows prompts/generators).
 */
export function AddSourceModal({
  kinds,
  title,
  onPick,
  onClose,
}: {
  kinds: StudioKind[];
  title: string;
  onPick: (item: PickedItem) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<StudioKind>(kinds[0]);
  const [query, setQuery] = useState("");
  const { realPrompts } = useRealPrompts();
  const { realGenerators } = useRealGenerators();
  const { realPresets } = useRealPresets();
  const { realWorkflows } = useRealWorkflows();
  const [found, setFound] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);

  const cached = useMemo(() => rowsFor(kind, realPrompts, realGenerators, realPresets, realWorkflows), [kind, realPrompts, realGenerators, realPresets, realWorkflows]);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- an emptied query returns to the cached list
      setFound(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const [p, g, pr, w] = await Promise.all([
        kind === "prompt" || kind === "dna" ? searchPrompts(text, {}, 30) : Promise.resolve([] as Prompt[]),
        kind === "generator" ? searchGenerators(text, {}, 30) : Promise.resolve([] as Generator[]),
        kind === "preset" ? searchPresets(text, {}, 30) : Promise.resolve([] as Preset[]),
        kind === "workflow" ? searchWorkflows(text, {}, 30) : Promise.resolve([] as Workflow[]),
      ]);
      if (cancelled) return;
      setFound(rowsFor(kind, p, g, pr, w));
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, kind]);

  const rows = found ?? cached;
  const Icon = KIND_ICONS[kind];

  return (
    <Modal onClose={onClose} labelledBy="studio-add-source-title">
      <div className="flex h-[min(80dvh,620px)] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
          <h2 id="studio-add-source-title" className="text-h3 font-semibold text-text">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 px-4 pt-3">
          {kinds.length > 1 && (
            <div className="overflow-x-auto scrollbar-none">
              <Tabs
                items={kinds.map((k) => ({ key: k, label: t(`studio.kind.${k}` as const) }))}
                active={kind}
                onChange={(next) => {
                  setKind(next);
                  setQuery("");
                }}
                ariaLabel={t("studio.sources")}
                variant="segmented"
              />
            </div>
          )}
          <label className="relative block">
            <span className="sr-only">{t("studio.searchLibrary")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("studio.searchLibrary")}
              className="h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-body text-text placeholder:text-text-muted focus:border-primary"
            />
          </label>
          {kind === "dna" && <p className="text-caption text-text-secondary">{t("studio.dnaPickHint")}</p>}
        </div>
        <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {searching && rows.length === 0 && (
            <li className="space-y-2 px-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </li>
          )}
          {!searching && rows.length === 0 && <li className="px-4 py-8 text-center text-small text-text-secondary">{t("studio.noLibraryResults")}</li>}
          {rows.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onPick(row.item)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-small font-medium text-text">{row.item.title}</span>
                  <span className="block truncate text-caption text-text-secondary">{row.item.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
