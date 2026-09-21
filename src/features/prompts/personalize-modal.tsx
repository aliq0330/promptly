"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { resolvePromptText } from "@/lib/prompt-variables";
import { CopyPromptButton } from "./copy-prompt-button";
import type { PromptVariable } from "@/types";

/**
 * Public "Promptu kişiselleştir" flow (CLAUDE.md §5) — shown to any viewer
 * of a published prompt that defines at least one real variable. Lets them
 * fill in their own values (starting from each variable's default), preview
 * the result live, reset back to the defaults, and — the one thing that
 * must never be confused — copy either the fully RESOLVED text (their own
 * values substituted) or the raw TEMPLATE (`{tokens}` intact, unresolved).
 * Never mutates the real prompt/template itself — this is entirely local,
 * throwaway state that vanishes when the modal closes.
 */
export function PersonalizeModal({
  promptText,
  variables,
  onClose,
}: {
  promptText: string;
  variables: PromptVariable[];
  onClose: () => void;
}) {
  const defaults = Object.fromEntries(variables.map((variable) => [variable.name, variable.defaultValue]));
  const [values, setValues] = useState<Record<string, string>>(defaults);

  const resolvedText = resolvePromptText(promptText, values);
  const isCustomized = variables.some((variable) => (values[variable.name] ?? "") !== variable.defaultValue);

  return (
    <Modal onClose={onClose} labelledBy="personalize-modal-title">
      <div
        className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="personalize-modal-title" className="text-base font-semibold text-text">
            Promptu Kişiselleştir
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            {variables.map((variable) => (
              <div key={variable.id}>
                <label htmlFor={`personalize-${variable.id}`} className="mb-1 block text-xs font-medium text-text">
                  {`{${variable.name}}`}
                  {variable.description && <span className="ml-1.5 font-normal text-text-muted">— {variable.description}</span>}
                </label>
                <input
                  id={`personalize-${variable.id}`}
                  type="text"
                  value={values[variable.name] ?? ""}
                  onChange={(event) => setValues((prev) => ({ ...prev, [variable.name]: event.target.value }))}
                  placeholder={variable.defaultValue || "Değer gir"}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
                />
              </div>
            ))}
            {isCustomized && (
              <button
                type="button"
                onClick={() => setValues(defaults)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Varsayılanlara dön
              </button>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Önizleme</p>
            <div className="whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-text">
              {resolvedText}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <CopyPromptButton text={resolvedText} label="Promptu Kopyala" size="md" />
          <CopyPromptButton text={promptText} label="Şablonu Kopyala" size="md" />
        </div>
      </div>
    </Modal>
  );
}
