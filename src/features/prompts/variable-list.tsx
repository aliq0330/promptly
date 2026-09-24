"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { countVariableUsages } from "@/lib/prompt-variables";
import type { DraftVariable } from "./prompt-text-editor";

/**
 * "Değişkenler" management panel (CLAUDE.md §4) — lists every draft
 * variable with its live usage count (recomputed from the CURRENT prompt
 * text on every render, never a stale stored number) and lets the user
 * rename (delegated to the caller via `onEdit` → `VariableEditorModal`) or
 * delete (with a two-click confirm showing exactly how many `{token}`
 * occurrences will be removed from the text, per the spec's "Bu değişken
 * prompt metninde N yerde kullanılıyor" warning).
 */
export function VariableList({
  variables,
  promptText,
  onEdit,
  onDelete,
}: {
  variables: DraftVariable[];
  promptText: string;
  onEdit: (variable: DraftVariable) => void;
  onDelete: (variable: DraftVariable) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (variables.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Değişkenler ({variables.length})
      </p>
      <ul className="space-y-1.5">
        {variables.map((variable) => {
          const usageCount = countVariableUsages(promptText, variable.name);
          const isConfirming = confirmingId === variable.tempId;
          return (
            <li
              key={variable.tempId}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-mono text-primary">{`{${variable.name}}`}</span>
                {variable.defaultValue && (
                  <span className="ml-2 truncate text-xs text-text-muted">→ {variable.defaultValue}</span>
                )}
                <span className="ml-2 text-xs text-text-muted">
                  {usageCount === 0 ? "metinde hiç kullanılmıyor" : `${usageCount} yerde kullanılıyor`}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingId(null);
                    onEdit(variable);
                  }}
                  aria-label={`${variable.name} değişkenini düzenle`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-accent-surface hover:text-text"
                >
                  <Pencil size={13} />
                </button>
                {isConfirming ? (
                  <button
                    type="button"
                    onClick={() => onDelete(variable)}
                    className="whitespace-nowrap rounded-md bg-danger/10 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20"
                  >
                    {usageCount > 0
                      ? `Bu değişken prompt metninde ${usageCount} yerde kullanılıyor. Silersen bu alanlar da kaldırılacak. Onayla`
                      : "Sil, emin misin?"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(variable.tempId)}
                    aria-label={`${variable.name} değişkenini sil`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
