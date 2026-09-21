"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { fetchEditHistory } from "@/lib/supabase/content-edits";
import { formatRelativeTime } from "@/lib/utils";
import type { ContentEditEvent } from "@/types";

/** Raw DB column name → the Turkish label shown to the owner (§15's "Değiştirilen alanlar"). Never shows the actual previous text (§12/§19 — content_edits doesn't even expose it, see ContentEditEvent). */
const FIELD_LABELS: Record<string, string> = {
  title: "Başlık",
  description: "Açıklama",
  prompt_text: "Prompt Metni",
  tool: "Araç",
  creative_direction: "Yaratıcı Yön",
  preferred_tool: "Tercih Edilen Araç",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/**
 * Owner-only "Son düzenleme"/"Düzenleme geçmişi" panel (CLAUDE.md §15) —
 * only ever rendered by a caller that already confirmed `isOwn`/
 * `isOwnRequest` (RLS would return an empty list for anyone else anyway,
 * see `fetchEditHistory`, so this is a courtesy against a wasted always-
 * empty query, not the real security boundary). Shows only WHICH fields
 * changed and WHEN — never the previous text itself, which stays DB-only.
 */
export function EditHistoryPanel({ contentType, contentId }: { contentType: "prompt" | "prompt_request"; contentId: string }) {
  const [events, setEvents] = useState<ContentEditEvent[] | null>(null);
  const [expanded, setExpanded] = useState(false);

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
        Son düzenleme: {formatRelativeTime(latest.createdAt)} · Düzenleme geçmişi
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
          {events.map((event) => (
            <li key={event.id}>
              <span className="text-text">{event.changedFields.map(fieldLabel).join(", ")}</span>{" "}
              <span>· {formatRelativeTime(event.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
