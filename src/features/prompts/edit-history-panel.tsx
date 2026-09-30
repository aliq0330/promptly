"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { fetchEditHistory } from "@/lib/supabase/content-edits";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ContentEditEvent } from "@/types";

/** Raw DB column name → the translation key shown to the owner (§15's "Değiştirilen alanlar"). Never shows the actual previous text (§12/§19 — content_edits doesn't even expose it, see ContentEditEvent). */
const FIELD_LABEL_KEYS: Record<string, TranslationKey> = {
  title: "forms.title",
  description: "forms.shortDescription",
  prompt_text: "prompt.promptTextHeading",
  tool: "forms.toolModel",
  creative_direction: "request.creativeDirection",
  preferred_tool: "request.preferredTool",
  category: "editHistory.category",
  subcategory: "editHistory.subcategory",
  cover_url: "editHistory.coverImage",
  visibility: "editHistory.visibility",
};

/**
 * Owner-only "Son düzenleme"/"Düzenleme geçmişi" panel (CLAUDE.md §15) —
 * only ever rendered by a caller that already confirmed `isOwn`/
 * `isOwnRequest` (RLS would return an empty list for anyone else anyway,
 * see `fetchEditHistory`, so this is a courtesy against a wasted always-
 * empty query, not the real security boundary). Shows only WHICH fields
 * changed and WHEN — never the previous text itself, which stays DB-only.
 */
export function EditHistoryPanel({ contentType, contentId }: { contentType: "prompt" | "prompt_request" | "generator"; contentId: string }) {
  const { t, language } = useTranslation();
  const [events, setEvents] = useState<ContentEditEvent[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  function fieldLabel(field: string): string {
    const key = FIELD_LABEL_KEYS[field];
    return key ? t(key) : field;
  }

  useEffect(() => {
    let cancelled = false;
    fetchEditHistory(contentType, contentId).then((result) => {
      if (!cancelled) setEvents(result);
    });
    return () => {
      cancelled = true;
    };
  }, [contentType, contentId]);

  if (!events || events.length === 0) return null;

  const latest = events[0];

  return (
    <div className="border-t border-border pt-3 text-xs text-text-muted">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 font-medium text-text-muted transition-colors hover:text-text"
      >
        <History size={13} />
        {t("editHistory.lastEdited")}: {formatRelativeTime(latest.createdAt, language)} · {t("editHistory.editHistory")}
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
          {events.map((event) => (
            <li key={event.id}>
              <span className="text-text">{event.changedFields.map(fieldLabel).join(", ")}</span>{" "}
              <span>· {formatRelativeTime(event.createdAt, language)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
