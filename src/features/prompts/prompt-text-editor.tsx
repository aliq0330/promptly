"use client";

import { useRef, useState } from "react";
import { Eye, FileText, Plus } from "lucide-react";
import {
  countRawOccurrences,
  extractVariableTokenNames,
  insertTextAtRange,
  isValidVariableName,
  normalizeVariableName,
  removeVariableTokenFromText,
  renameVariableTokenInText,
  replaceAllOccurrencesWithToken,
  resolvePromptText,
} from "@/lib/prompt-variables";
import { cn } from "@/lib/utils";
import { AddVariableFromSelectionModal } from "./add-variable-from-selection-modal";
import { VariableEditorModal } from "./variable-editor-modal";
import { VariableList } from "./variable-list";

/** A not-yet-persisted variable living only in this form's own state — gets a real DB row (with a real `id`) only once the prompt itself is created/updated (see `replaceVariablesForPrompt`, `src/lib/supabase/prompt-variables.ts`). */
export interface DraftVariable {
  tempId: string;
  name: string;
  defaultValue: string;
  description: string;
}

function makeTempId(): string {
  return `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * CLAUDE.md "Prompt Değişken Sistemi" §1-3 — wraps the prompt-text
 * `<textarea>` with a "Değişken Ekle" button that inserts a new `{token}`
 * at the caller's actual last-known cursor/selection (never appended to the
 * end), a "Değişkenler" management list (rename/delete, `variable-list.tsx`),
 * and a Şablon/Önizleme tab pair (§3) that previews with default/custom
 * values without ever mutating the real template in `value`.
 */
export function PromptTextEditor({
  id = "prompt-text",
  value,
  onChange,
  variables,
  onVariablesChange,
  rows = 5,
  placeholder,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  variables: DraftVariable[];
  onVariablesChange: (variables: DraftVariable[]) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: value.length, end: value.length });
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tab, setTab] = useState<"template" | "preview">("template");
  const activeTab = variables.length === 0 ? "template" : tab;
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number; rawText: string } | null>(
    null,
  );
  const [editingVariable, setEditingVariable] = useState<DraftVariable | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  function trackSelection() {
    const el = textareaRef.current;
    if (!el) return;
    selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
  }

  function showSelectionWarning(message: string) {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    setSelectionWarning(message);
    warningTimer.current = setTimeout(() => setSelectionWarning(null), 4500);
  }

  // "Değişken Ekle" never opens a modal on its own — a variable's name is
  // always the word/phrase the author actually highlighted in the prompt
  // text, never freely typed, since the same word can genuinely appear
  // more than once and typing an unrelated name here would silently
  // disconnect the variable from the text it was meant to replace.
  function handleAddVariableClick() {
    const { start, end } = selectionRef.current;
    const rawSelection = value.slice(start, end);
    const leadingTrim = rawSelection.length - rawSelection.trimStart().length;
    const trailingTrim = rawSelection.length - rawSelection.trimEnd().length;
    const trimmed = rawSelection.trim();
    if (!trimmed) {
      showSelectionWarning("Önce prompt metninden kelime seçip daha sonra tıklayın.");
      return;
    }
    if (!isValidVariableName(normalizeVariableName(trimmed))) {
      showSelectionWarning(
        "Seçilen metin değişken adı olarak kullanılamıyor (çok uzun ya da geçersiz karakter içeriyor).",
      );
      return;
    }
    setSelectionWarning(null);
    setPendingSelection({ start: start + leadingTrim, end: end - trailingTrim, rawText: trimmed });
  }

  const pendingNormalizedName = pendingSelection ? normalizeVariableName(pendingSelection.rawText) : "";
  const pendingOccurrenceCount = pendingSelection ? countRawOccurrences(value, pendingSelection.rawText) : 0;
  const pendingExistingVariable = pendingSelection
    ? (variables.find((variable) => variable.name.toLowerCase() === pendingNormalizedName.toLowerCase()) ?? null)
    : null;

  function handleConfirmAddFromSelection(values: { defaultValue: string; description: string; replaceAll: boolean }) {
    if (!pendingSelection) return;
    const { start, end, rawText } = pendingSelection;
    let nextText: string;
    let cursor: number | null;
    if (values.replaceAll) {
      nextText = replaceAllOccurrencesWithToken(value, rawText, pendingNormalizedName);
      cursor = null;
    } else {
      const result = insertTextAtRange(value, start, end, `{${pendingNormalizedName}}`);
      nextText = result.text;
      cursor = result.cursor;
    }
    onChange(nextText);
    if (!pendingExistingVariable) {
      onVariablesChange([
        ...variables,
        { tempId: makeTempId(), name: pendingNormalizedName, defaultValue: values.defaultValue, description: values.description },
      ]);
    }
    setPendingSelection(null);
    if (cursor !== null) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(cursor, cursor);
          selectionRef.current = { start: cursor, end: cursor };
        }
      });
    }
  }

  function handleEditVariable(values: { name: string; defaultValue: string; description: string }) {
    if (!editingVariable) return;
    const nextText =
      values.name !== editingVariable.name
        ? renameVariableTokenInText(value, editingVariable.name, values.name)
        : value;
    if (nextText !== value) onChange(nextText);
    onVariablesChange(
      variables.map((variable) => (variable.tempId === editingVariable.tempId ? { ...variable, ...values } : variable)),
    );
    setEditingVariable(null);
  }

  function handleDeleteVariable(variable: DraftVariable) {
    onChange(removeVariableTokenFromText(value, variable.name));
    onVariablesChange(variables.filter((item) => item.tempId !== variable.tempId));
  }

  const existingNames = variables
    .filter((variable) => variable.tempId !== editingVariable?.tempId)
    .map((variable) => variable.name.toLowerCase());

  const previewText = resolvePromptText(
    value,
    Object.fromEntries(
      variables.map((variable) => [variable.name, previewValues[variable.name] ?? variable.defaultValue]),
    ),
  );

  const orphanTokens = extractVariableTokenNames(value).filter(
    (name) => !variables.some((variable) => variable.name === name),
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTab("template")}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors",
              activeTab === "template" ? "bg-accent-surface text-text" : "text-text-muted hover:text-text",
            )}
          >
            <FileText size={12} /> Şablon
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            disabled={variables.length === 0}
            title={variables.length === 0 ? "Önizlemek için önce en az bir değişken ekle." : undefined}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors disabled:opacity-40",
              activeTab === "preview" ? "bg-accent-surface text-text" : "text-text-muted hover:text-text",
            )}
          >
            <Eye size={12} /> Önizleme
          </button>
        </div>
        <button
          type="button"
          onClick={handleAddVariableClick}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Plus size={12} /> Değişken Ekle
        </button>
      </div>

      {selectionWarning && <p className="text-xs text-warning">{selectionWarning}</p>}

      {activeTab === "template" ? (
        <textarea
          id={id}
          ref={textareaRef}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onSelect={trackSelection}
          onKeyUp={trackSelection}
          onClick={trackSelection}
          onBlur={trackSelection}
          rows={rows}
          placeholder={placeholder}
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted"
        />
      ) : (
        <div className="space-y-3 rounded-md border border-border bg-background p-3">
          <div className="whitespace-pre-wrap font-mono text-sm text-text">{previewText}</div>
          <div className="space-y-2 border-t border-border pt-3">
            {variables.map((variable) => (
              <div key={variable.tempId} className="flex items-center gap-2">
                <label
                  htmlFor={`preview-${variable.tempId}`}
                  className="w-28 shrink-0 truncate font-mono text-xs text-text-muted"
                  title={`{${variable.name}}`}
                >
                  {`{${variable.name}}`}
                </label>
                <input
                  id={`preview-${variable.tempId}`}
                  type="text"
                  value={previewValues[variable.name] ?? variable.defaultValue}
                  onChange={(event) =>
                    setPreviewValues((prev) => ({ ...prev, [variable.name]: event.target.value }))
                  }
                  className="h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-text"
                />
              </div>
            ))}
          </div>
          {Object.keys(previewValues).length > 0 && (
            <button
              type="button"
              onClick={() => setPreviewValues({})}
              className="text-xs font-medium text-primary hover:underline"
            >
              Varsayılanlara dön
            </button>
          )}
        </div>
      )}

      {orphanTokens.length > 0 && (
        <p className="text-xs text-warning">
          Metinde tanımlanmamış değişken(ler) var: {orphanTokens.map((name) => `{${name}}`).join(", ")} — bunları
          &quot;Değişken Ekle&quot; ile tanımlayabilirsin.
        </p>
      )}

      <VariableList
        variables={variables}
        promptText={value}
        onEdit={(variable) => setEditingVariable(variable)}
        onDelete={handleDeleteVariable}
      />

      {pendingSelection && (
        <AddVariableFromSelectionModal
          rawText={pendingSelection.rawText}
          normalizedName={pendingNormalizedName}
          occurrenceCount={pendingOccurrenceCount}
          existingVariable={pendingExistingVariable}
          onClose={() => setPendingSelection(null)}
          onSubmit={handleConfirmAddFromSelection}
        />
      )}
      {editingVariable && (
        <VariableEditorModal
          editing={editingVariable}
          existingNames={existingNames}
          onClose={() => setEditingVariable(null)}
          onSubmit={handleEditVariable}
        />
      )}
    </div>
  );
}
