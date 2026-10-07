"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { DRAFT_ID } from "./compare-pane";
import type { StudioVersion } from "./studio-model";

/**
 * A compact V1 · V2 · … · Güncel strip for narrow layouts. Picking a version
 * opens the Compare tab with that version against the current draft.
 */
export function VersionStrip({ versions, currentId, onPick }: { versions: StudioVersion[]; currentId: string | null; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("studio.tab.versions")} className="min-w-0 space-y-2">
      <h2 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.tab.versions")}</h2>
      <div className="scrollbar-none flex min-w-0 gap-2 overflow-x-auto pb-1">
        {versions.map((version) => (
          <button
            key={version.id}
            type="button"
            onClick={() => onPick(version.id)}
            aria-label={`${t("studio.compare")} V${version.number}`}
            className={cn(
              "inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              version.kind === "variation" ? "border-secondary/50 bg-surface text-text" : "border-border bg-surface text-text-secondary",
              currentId === version.id && "border-primary bg-primary-soft text-text",
            )}
          >
            V{version.number}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick(DRAFT_ID)}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-primary bg-primary px-3.5 text-small font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {t("studio.currentVersion")}
        </button>
      </div>
    </section>
  );
}
