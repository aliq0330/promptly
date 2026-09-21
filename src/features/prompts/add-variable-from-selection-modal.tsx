"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { DraftVariable } from "./prompt-text-editor";

/**
 * "Değişken Ekle" modal — always opened from a real text selection in the
 * prompt editor (`PromptTextEditor`'s "Değişken Ekle" button refuses to
 * open this at all when nothing is selected, see there). The variable's
 * NAME is never freely typed here — it's fixed to the selected word/phrase
 * (shown read-only), because the same word can genuinely appear more than
 * once in a prompt and typing a different name here would silently
 * disconnect the new variable from the very text the user just pointed at.
 *
 * Two modes, decided by whether `existingVariable` is set:
 *  - New variable: default value/description are freely editable (default
 *    value pre-filled with the selected text itself, so the template
 *    resolves back to what was there before unless the author changes it).
 *  - Existing variable (the selected word matches an already-added
 *    variable's name): no new draft is created — the selection is simply
 *    turned into another reference to the SAME variable, so its
 *    default/description are shown for context only, never re-editable
 *    from here (editing it would be surprising: it'd also change every
 *    other place already using that variable, from a modal that looks
 *    like it's about to create something new).
 *
 * Either way, if the selected text occurs more than once in the current
 * prompt, a checkbox lets the author turn EVERY occurrence into the same
 * variable in one action instead of just the one they highlighted.
 */
export function AddVariableFromSelectionModal({
  rawText,
  normalizedName,
  occurrenceCount,
  existingVariable,
  onClose,
  onSubmit,
}: {
  rawText: string;
  normalizedName: string;
  occurrenceCount: number;
  existingVariable: DraftVariable | null;
  onClose: () => void;
  onSubmit: (values: { defaultValue: string; description: string; replaceAll: boolean }) => void;
}) {
  const [defaultValue, setDefaultValue] = useState(rawText);
  const [description, setDescription] = useState("");
  const [replaceAll, setReplaceAll] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Same React-portal synthetic-bubbling gotcha as VariableEditorModal —
    // without this, submitting this modal also submits the outer
    // prompt-publish form it's logically nested inside.
    event.stopPropagation();
    onSubmit({ defaultValue, description, replaceAll });
  }

  return (
    <Modal onClose={onClose} labelledBy="add-variable-modal-title">
      <div
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="add-variable-modal-title" className="text-base font-semibold text-text">
            Değişken Ekle
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="add-variable-name" className="mb-1.5 block text-sm font-medium text-text">
              Değişken Adı
            </label>
            <input
              id="add-variable-name"
              type="text"
              value={normalizedName}
              readOnly
              disabled
              className="h-10 w-full cursor-not-allowed rounded-md border border-border bg-accent-surface/40 px-3 text-sm text-text"
            />
            <p className="mt-1.5 font-mono text-xs text-primary">{`{${normalizedName}}`}</p>
            <p className="mt-1 text-xs text-text-muted">
              Prompt metninden seçtiğin kelime/ifade — burada değiştirilemez.
            </p>
          </div>

          {existingVariable ? (
            <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium text-primary">Bu isimde bir değişken zaten var</p>
              <p className="text-xs text-text-muted">
                Seçtiğin metin, mevcut <span className="font-mono">{`{${normalizedName}}`}</span> değişkenine
                bağlanacak — yeni bir değişken oluşturulmayacak.
              </p>
              {existingVariable.defaultValue && (
                <p className="text-xs text-text-muted">
                  Varsayılan değer: <span className="text-text">{existingVariable.defaultValue}</span>
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="add-variable-default" className="mb-1.5 block text-sm font-medium text-text">
                  Varsayılan Değer <span className="text-text-muted">(opsiyonel)</span>
                </label>
                <input
                  id="add-variable-default"
                  type="text"
                  value={defaultValue}
                  onChange={(event) => setDefaultValue(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
                />
              </div>
              <div>
                <label htmlFor="add-variable-description" className="mb-1.5 block text-sm font-medium text-text">
                  Açıklama <span className="text-text-muted">(opsiyonel)</span>
                </label>
                <textarea
                  id="add-variable-description"
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Örn. Sahnenin geçeceği ortamı belirt."
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
                />
              </div>
            </>
          )}

          {occurrenceCount > 1 && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={replaceAll}
                onChange={(event) => setReplaceAll(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                Metinde &ldquo;{rawText}&rdquo; toplam {occurrenceCount} yerde geçiyor — tümünü bu değişkenle
                değiştir.
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit">{existingVariable ? "Bağla" : "Ekle"}</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
