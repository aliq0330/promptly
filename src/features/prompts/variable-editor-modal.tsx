"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { isValidVariableName, normalizeVariableName } from "@/lib/prompt-variables";
import type { DraftVariable } from "./prompt-text-editor";

/**
 * "Değişkeni düzenle" modal (CLAUDE.md §4) — renaming an existing variable
 * (the caller then propagates the rename into every `{oldName}` token in
 * the text — see `prompt-text-editor.tsx`'s `handleEditVariable`) or
 * editing its default value/description. Creating a BRAND NEW variable no
 * longer goes through this modal — that always starts from a real text
 * selection in the editor now (`add-variable-from-selection-modal.tsx`),
 * so a variable's name is never freely typed out of nowhere; this modal
 * only ever adjusts a variable that already exists.
 */
export function VariableEditorModal({
  editing,
  existingNames,
  onClose,
  onSubmit,
}: {
  editing: DraftVariable;
  /** Every OTHER variable's normalized name already in use on this prompt — for the duplicate-name check (excludes `editing`'s own current name). */
  existingNames: string[];
  onClose: () => void;
  onSubmit: (values: { name: string; defaultValue: string; description: string }) => void;
}) {
  const [name, setName] = useState(editing.name);
  const [defaultValue, setDefaultValue] = useState(editing.defaultValue);
  const [description, setDescription] = useState(editing.description);
  const [touched, setTouched] = useState(false);

  const normalizedName = normalizeVariableName(name);
  const error = !touched
    ? null
    : normalizedName.length === 0
      ? "Değişken adı boş bırakılamaz."
      : !isValidVariableName(normalizedName)
        ? "Değişken adı süslü parantez veya boşluk içeremez, en fazla 40 karakter olmalı."
        : existingNames.includes(normalizedName.toLowerCase())
          ? "Bu prompt içinde aynı isimde başka bir değişken zaten var."
          : null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // React bubbles synthetic events along the REACT tree, not the DOM tree
    // — even though `Modal` portals this `<form>` out to `document.body`,
    // without `stopPropagation()` this "submit" would still bubble up to
    // (and prematurely trigger) the outer prompt-publish `<form>` this
    // modal is logically nested inside (`PromptTextEditor` → the create/
    // edit form). Caught and fixed during this feature's own testing —
    // see CLAUDE.md's "Prompt Değişken Sistemi" notes.
    event.stopPropagation();
    setTouched(true);
    if (
      normalizedName.length === 0 ||
      !isValidVariableName(normalizedName) ||
      existingNames.includes(normalizedName.toLowerCase())
    ) {
      return;
    }
    onSubmit({ name: normalizedName, defaultValue, description });
  }

  return (
    <Modal onClose={onClose} labelledBy="variable-editor-modal-title">
      <div
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="variable-editor-modal-title" className="text-base font-semibold text-text">
            Değişkeni Düzenle
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
            <label htmlFor="variable-name" className="mb-1.5 block text-sm font-medium text-text">
              Değişken Adı
            </label>
            <input
              id="variable-name"
              type="text"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Örn. ortam"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
            {normalizedName && (
              <p className="mt-1.5 font-mono text-xs text-primary">{`{${normalizedName}}`}</p>
            )}
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          </div>

          <div>
            <label htmlFor="variable-default" className="mb-1.5 block text-sm font-medium text-text">
              Varsayılan Değer <span className="text-text-muted">(opsiyonel)</span>
            </label>
            <input
              id="variable-default"
              type="text"
              value={defaultValue}
              onChange={(event) => setDefaultValue(event.target.value)}
              placeholder="Örn. sisli orman"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div>
            <label htmlFor="variable-description" className="mb-1.5 block text-sm font-medium text-text">
              Açıklama <span className="text-text-muted">(opsiyonel)</span>
            </label>
            <textarea
              id="variable-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Örn. Sahnenin geçeceği ortamı belirt."
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit">Kaydet</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
