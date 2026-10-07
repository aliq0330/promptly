"use client";

import { Dna } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { DnaSection } from "@/lib/prompt-dna/types";
import { OpenInStudioButton } from "@/features/studio/open-in-studio";
import { DNA_ICONS, dnaSectionLabel } from "./dna-section-meta";

/**
 * The prompt's DNA (the "Prompt DNA" tab of its detail page): only the
 * sections the author accepted, in the fixed canonical order. The caller
 * fetches them (it needs the count to decide whether the tab exists) and
 * only renders this for a prompt that has DNA.
 */
export function PromptDnaDisplay({ sections, studioPromptId }: { sections: DnaSection[]; studioPromptId?: string }) {
  const { t } = useTranslation();

  if (sections.length === 0) return null;

  return (
    <section aria-labelledby="prompt-dna-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="prompt-dna-title" className="flex items-center gap-1.5 font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
          <Dna size={14} />
          {t("dna.title")}
        </h2>
        <span className="flex items-center gap-3">
          <span className="text-caption text-text-muted">{t("dna.sectionsCount", { count: sections.length })}</span>
          {studioPromptId && <OpenInStudioButton size="sm" refs={{ prompt: studioPromptId }} />}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => {
          const Icon = DNA_ICONS[section.type];
          return (
            <li key={section.id} className="min-w-0 rounded-md border border-border-soft bg-surface p-3">
              <p className="flex items-center gap-1.5 text-label font-semibold text-text">
                <Icon size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate">{dnaSectionLabel(section, t)}</span>
              </p>
              <p className="mt-1 break-words text-small text-text-secondary">{section.content}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
