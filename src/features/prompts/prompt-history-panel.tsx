"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { diffPromptFields, FIELD_DIFF_LABEL_KEYS } from "@/lib/prompt-diff";
import { fetchVersionsForPrompt } from "@/lib/supabase/prompt-versions";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { DiffText } from "./diff-text";
import type { PromptVersion } from "@/types";

const SOURCE_LABEL_KEYS: Record<PromptVersion["source"], TranslationKey> = {
  initial: "promptHistory.sourceInitial",
  owner_edit: "promptHistory.sourceOwnerEdit",
  edit_suggestion_accepted: "promptHistory.sourceSuggestionAccepted",
};

/**
 * Public "Prompt Geçmişi" section (CLAUDE.md şartnamesi §7/§8/§9) — visible
 * to anyone who can view the prompt itself (same RLS as the prompt's own
 * content), not just its owner: every real `prompt_versions` snapshot, each
 * comparable against the version right before it. Renders nothing for a
 * prompt that's never had a version created (never edited, never accepted a
 * suggestion) — an honest, common case, not an error.
 */
export function PromptHistoryPanel({ promptId }: { promptId: string }) {
  const { t, language } = useTranslation();
  const [versions, setVersions] = useState<PromptVersion[] | null>(null);
  const [comparingId, setComparingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVersionsForPrompt(promptId).then((result) => {
      if (!cancelled) setVersions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  if (!versions || versions.length === 0) return null;

  // `fetchVersionsForPrompt` orders newest-first, so each version's
  // immediate predecessor is simply the next item in this same array.
  const latestNumber = versions[0]?.versionNumber;

  return (
    <section className="space-y-3 rounded-lg border border-border-soft bg-surface p-4 sm:p-5">
      <h2 className="flex items-center gap-1.5 text-label font-semibold text-text">
        <History size={16} />
        {t("promptHistory.title")}
      </h2>
      <ul className="space-y-2">
        {versions.map((version, index) => {
          const previous = versions[index + 1];
          const isComparing = comparingId === version.id;
          const fieldDiffs = previous ? diffPromptFields(previous, version) : [];

          return (
            <li key={version.id} className="rounded-md border border-border-soft bg-surface-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-text">
                  v{version.versionNumber}
                  {version.versionNumber === latestNumber && <span className="ml-1.5 text-primary">· {t("promptHistory.current")}</span>}
                </span>
                <span className="text-xs text-text-muted">{formatRelativeTime(version.createdAt, language)}</span>
              </div>
              <p className="mt-1 text-xs text-text-muted">{t(SOURCE_LABEL_KEYS[version.source])}</p>

              {previous && (
                <button
                  type="button"
                  onClick={() => setComparingId(isComparing ? null : version.id)}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  {isComparing ? t("promptHistory.hideComparison") : t("promptHistory.compareWith", { version: previous.versionNumber })}
                </button>
              )}

              {isComparing && previous && (
                <div className="mt-2 space-y-3 rounded-md border border-border-soft bg-background p-3">
                  {fieldDiffs.length === 0 ? (
                    <p className="text-xs text-text-muted">{t("promptHistory.noTextDifference")}</p>
                  ) : (
                    fieldDiffs.map((diff) => (
                      <div key={diff.key}>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{t(FIELD_DIFF_LABEL_KEYS[diff.key])}</p>
                        <DiffText before={diff.before} after={diff.after} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
