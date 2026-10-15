"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { fetchEditHistory } from "@/lib/supabase/content-edits";
import { editHistoryExtraFields } from "@/lib/version-history";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ContentEditEvent } from "@/types";

/** Raw DB column name → the translation key shown to the owner (§15's "Değiştirilen alanlar"). Never shows the actual previous text (§12/§19 — content_edits doesn't even expose it, see ContentEditEvent). The snapshot fields (title, description, prompt text / creative direction, tool) are NOT listed here: the version list already shows them. */
const FIELD_LABEL_KEYS: Record<string, TranslationKey> = {
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
 * Lives inside the "Geçmiş" tab under the version list and is limited to the
 * fields the version snapshots do NOT cover (`editHistoryExtraFields`), so the
 * two panels never show the same change twice; an event whose every changed
 * field is a snapshot field is simply not listed, and with nothing left the
 * panel renders nothing.
 */
export function EditHistoryPanel({ contentType, contentId }: { contentType: "prompt" | "prompt_request"; contentId: string }) {
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

  const listed = (events ?? [])
    .map((event) => ({ event, fields: editHistoryExtraFields(contentType, event.changedFields) }))
    .filter((entry) => entry.fields.length > 0);
  if (listed.length === 0) return null;

  const latest = listed[0].event;

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
          {listed.map(({ event, fields }) => (
            <li key={event.id}>
              <span className="text-text">{fields.map(fieldLabel).join(", ")}</span>{" "}
              <span>· {formatRelativeTime(event.createdAt, language)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
