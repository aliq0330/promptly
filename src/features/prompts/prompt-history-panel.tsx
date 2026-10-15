"use client";

import { useEffect, useState } from "react";
import { diffPromptFields, FIELD_DIFF_LABEL_KEYS } from "@/lib/prompt-diff";
import { fetchSuggestionsForPrompt } from "@/lib/supabase/prompt-edit-suggestions";
import { restorePromptVersion } from "@/lib/supabase/content-versions";
import { TextFieldsDiffView } from "@/features/versions/version-diffs";
import { VersionHistoryPanel } from "@/features/versions/version-history-panel";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptVersion } from "@/types";

/**
 * Public "Prompt Geçmişi" (CLAUDE.md şartnamesi §7/§8/§9) — the Prompt adapter of the shared
 * `VersionHistoryPanel`: every real `prompt_versions` snapshot, visible to anyone who can view the prompt itself
 * (RLS), comparable against any other version, copyable (the version's prompt text), restorable by the owner.
 * The caller only mounts it when the prompt has versions — a never-edited prompt has no history tab at all.
 * Restore is the owner's ordinary UPDATE of the four snapshot fields; the existing trigger writes the new version.
 * Next to an accepted suggestion the OWNER also sees who suggested it (never the suggestion text — that stays private).
 */
export function PromptHistoryPanel({ promptId, versions, isOwner }: { promptId: string; versions: PromptVersion[]; isOwner: boolean }) {
  const { t } = useTranslation();
  const [suggesters, setSuggesters] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    fetchSuggestionsForPrompt(promptId).then((suggestions) => {
      if (cancelled) return;
      const names = new Map<string, string>();
      for (const suggestion of suggestions) {
        if (suggestion.status === "accepted" && suggestion.acceptedVersionId) names.set(suggestion.acceptedVersionId, suggestion.proposer.displayName);
      }
      setSuggesters(names);
    });
    return () => {
      cancelled = true;
    };
  }, [promptId, isOwner]);

  return (
    <VersionHistoryPanel
      title={t("promptHistory.title")}
      contentId={promptId}
      versions={versions}
      isOwner={isOwner}
      copyText={(version) => version.promptText}
      onRestore={isOwner ? (version) => restorePromptVersion(version) : undefined}
      restoreConfirmKey="history.restoreConfirmPrompt"
      suggesterName={isOwner ? (version) => suggesters.get(version.id) ?? null : undefined}
      renderComparison={(older, newer) => (
        <TextFieldsDiffView diffs={diffPromptFields(older, newer)} labelKeyFor={(key) => FIELD_DIFF_LABEL_KEYS[key]} />
      )}
    />
  );
}
