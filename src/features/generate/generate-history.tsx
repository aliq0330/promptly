"use client";

import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatRelativeTime } from "@/lib/utils";
import type { HistoryEntry } from "@/lib/ai-generate/history-store";

/**
 * Past results of this browser (IndexedDB). Opening one puts it back among the
 * results; "Prompt'u yükle" copies the prompt that produced it into the prompt box.
 */
export function GenerateHistory({
  entries,
  onOpen,
  onUsePrompt,
  onDelete,
  onClear,
}: {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onUsePrompt: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  const { t, language } = useTranslation();
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="gen-history-title" className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="gen-history-title" className="flex items-center gap-2 text-label font-semibold text-text">
          <History size={16} aria-hidden /> {t("generate.history")}
          <span className="text-caption font-normal text-text-muted">({entries.length})</span>
        </h2>
        <button type="button" onClick={onClear} className="text-small font-medium text-danger hover:underline">
          {t("generate.historyClear")}
        </button>
      </div>
      <p className="text-caption text-text-muted">{t("generate.historyNote")}</p>
      <ul className="grid gap-2 sm:grid-cols-2" data-generate-history>
        {entries.map((entry) => (
          <li key={entry.id} data-history-entry={entry.id} className="flex min-w-0 gap-3 rounded-lg border border-border-soft bg-surface p-2">
            <button type="button" onClick={() => onOpen(entry)} aria-label={t("generate.historyOpen")} className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-soft text-left">
              {entry.output.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local base64 thumbnail
                <img src={entry.output.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="line-clamp-4 block p-1.5 text-[10px] leading-tight text-text-secondary">{entry.output.text}</span>
              )}
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="line-clamp-2 break-words text-small text-text">{entry.prompt}</p>
              <p className="truncate text-caption text-text-muted">
                {entry.model} · {formatRelativeTime(new Date(entry.createdAt).toISOString(), language)}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => onUsePrompt(entry)}>
                  {t("generate.historyUsePrompt")}
                </Button>
                <button type="button" onClick={() => onDelete(entry)} aria-label={t("generate.historyDelete")} className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-danger">
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
