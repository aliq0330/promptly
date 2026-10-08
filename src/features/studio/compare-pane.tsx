"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/language-provider";
import { diffSnapshots, diffWords, type DiffEntry, type StudioSnapshot } from "@/lib/studio-diff";
import { ScrollablePrompt } from "@/features/content/scrollable-prompt";
import { dnaLabelKey } from "@/features/prompts/dna-section-meta";
import type { DnaSectionType } from "@/lib/prompt-dna/types";
import type { TranslationKey } from "@/lib/i18n/translations";
import { DiffText } from "./diff-text";
import { composeStudioResult, type StudioVersion } from "./studio-model";

export const DRAFT_ID = "draft";

export function versionName(version: StudioVersion, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  const base = `V${version.number}`;
  const label = version.kind === "original" ? t("studio.originalVersion") : version.label;
  return label ? `${base} — ${label}` : base;
}

export const AREA_KEYS: Record<DiffEntry["area"], TranslationKey> = {
  prompt: "studio.area.prompt",
  variables: "studio.area.variables",
  dna: "studio.area.dna",
  generator: "studio.area.generator",
  preset: "studio.area.preset",
  workflow: "studio.area.workflow",
};

function entryLabel(entry: DiffEntry, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  if (entry.area === "dna" && entry.sectionType && entry.sectionType !== "custom") return t(dnaLabelKey(entry.sectionType as DnaSectionType));
  if (entry.area === "prompt") return entry.label === "title" ? t("studio.promptTitle") : t("studio.promptText");
  if (entry.label === "title") return t("studio.titleLabel");
  if (entry.label === "order") return t("studio.stepOrder");
  return entry.label;
}

/** V-A vs V-B (any two versions, or a version vs the live draft). Stacked + segmented on narrow screens, side by side from `lg`. */
export function ComparePane({
  versions,
  draft,
  aId,
  bId,
  onChange,
  enableNegative,
}: {
  versions: StudioVersion[];
  draft: StudioSnapshot;
  aId: string;
  bId: string;
  onChange: (next: { aId?: string; bId?: string }) => void;
  enableNegative: boolean;
}) {
  const { t, language } = useTranslation();
  const [view, setView] = useState<"diff" | "a" | "b">("diff");
  const options = useMemo(
    () => [...versions.map((v) => ({ id: v.id, name: versionName(v, t), snapshot: v.snapshot })), { id: DRAFT_ID, name: t("studio.currentDraft"), snapshot: draft }],
    [versions, draft, t],
  );
  const a = options.find((o) => o.id === aId) ?? options[0];
  const b = options.find((o) => o.id === bId) ?? options[options.length - 1];
  const entries = useMemo(() => diffSnapshots(a.snapshot, b.snapshot, language), [a.snapshot, b.snapshot, language]);
  const textA = useMemo(() => composeStudioResult(a.snapshot, language, enableNegative).text, [a.snapshot, language, enableNegative]);
  const textB = useMemo(() => composeStudioResult(b.snapshot, language, enableNegative).text, [b.snapshot, language, enableNegative]);
  const segments = useMemo(() => diffWords(textA, textB), [textA, textB]);
  const grouped = useMemo(() => {
    const map = new Map<DiffEntry["area"], DiffEntry[]>();
    for (const entry of entries) map.set(entry.area, [...(map.get(entry.area) ?? []), entry]);
    return [...map.entries()];
  }, [entries]);

  const select = (value: string, onPick: (id: string) => void, label: string) => (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-caption font-medium text-text-muted">{label}</span>
      <select value={value} onChange={(event) => onPick(event.target.value)} className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-small text-text focus:border-primary/60 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {select(a.id, (id) => onChange({ aId: id }), t("studio.compareFrom"))}
        <ArrowRight className="mb-3 hidden h-4 w-4 shrink-0 text-text-muted sm:block" aria-hidden />
        {select(b.id, (id) => onChange({ bId: id }), t("studio.compareTo"))}
      </div>

      <div className="lg:hidden">
        <Tabs
          items={[
            { key: "a" as const, label: a.name.split(" ")[0] },
            { key: "b" as const, label: b.name.split(" ")[0] },
            { key: "diff" as const, label: t("studio.differences") },
          ]}
          active={view}
          onChange={setView}
          ariaLabel={t("studio.compare")}
          variant="segmented"
        />
      </div>

      {a.id === b.id ? (
        <p className="rounded-md bg-surface-soft p-4 text-small text-text-secondary">{t("studio.compareSame")}</p>
      ) : (
        <>
          <div className={view === "diff" ? "space-y-4" : "hidden space-y-4 lg:block"}>
            <section aria-label={t("studio.resultDiff")} className="space-y-1.5">
              <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.resultDiff")}</h3>
              {textA || textB ? (
                <ScrollablePrompt>
                  <DiffText segments={segments} />
                </ScrollablePrompt>
              ) : (
                <p className="text-small text-text-secondary">{t("studio.resultEmpty")}</p>
              )}
            </section>
            <section aria-label={t("studio.differences")} className="space-y-2">
              <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                {t("studio.differences")} · {entries.length}
              </h3>
              {entries.length === 0 && <p className="text-small text-text-secondary">{t("studio.noChanges")}</p>}
              {grouped.map(([area, list]) => (
                <div key={area} className="space-y-1.5">
                  <p className="text-small font-semibold text-text">{t(AREA_KEYS[area])}</p>
                  <ul className="space-y-1.5">
                    {list.map((entry, index) => (
                      <li key={`${entry.label}-${index}`} className="rounded-md border border-border-soft bg-surface p-2.5 text-small">
                        <span className="mb-1 block text-caption font-medium text-text-muted">{entryLabel(entry, t)}</span>
                        {entry.area === "prompt" && entry.label === "text" ? (
                          <span className="text-text-secondary">{t("studio.seeResultDiff")}</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="min-w-0 break-words text-text-secondary line-through decoration-danger/60">{entry.before ?? t("studio.none")}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                            <span className="min-w-0 break-words font-medium text-text">{entry.after ?? t("studio.none")}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <section className={view === "a" ? "space-y-1.5" : "hidden space-y-1.5 lg:block"} aria-label={a.name}>
              <h3 className="truncate text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{a.name}</h3>
              <ScrollablePrompt>{textA || t("studio.resultEmpty")}</ScrollablePrompt>
            </section>
            <section className={view === "b" ? "space-y-1.5" : "hidden space-y-1.5 lg:block"} aria-label={b.name}>
              <h3 className="truncate text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{b.name}</h3>
              <ScrollablePrompt>{textB || t("studio.resultEmpty")}</ScrollablePrompt>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
