"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, FileText } from "lucide-react";
import {
  countRawOccurrences,
  extractVariableTokenNames,
  replaceAllOccurrencesWithToken,
  resolvePromptText,
} from "@/lib/prompt-variables";
import { removeToken, renameToken, tokenUsageMap } from "@/lib/prompt-doc";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { PromptComposer, type ComposerHandle } from "@/features/content/prompt-composer/prompt-composer";
import type { PickerFilter, PickerItem } from "@/features/content/prompt-composer/insert-picker";
import type { EditorSelection } from "@/features/content/prompt-composer/prompt-doc-editor";
import { VariableCreateModal } from "./variable-create-modal";
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
 * Normal prompt değişken düzenleyicisi (Bölüm 9.136).
 *
 * Kullanıcı prompt metnini doğrudan yazar; `{ad}` jetonları düzenleyicide
 * pastel etiketlere dönüşür. İki yol:
 *  - metinden kelime seç → bağlamsal çubuktan "Değişkene dönüştür"
 *    (ad + varsayılan değer + açıklama);
 *  - imleci bir yere koy → "Değişken ekle" (mobilde alt sayfa, masaüstünde
 *    imleç yanı pencere, gerekirse sağ panel) → var olanı seç ya da yenisini
 *    oluştur.
 * Altta kalan şey ham düz metindir (`{ad}` jetonlu, `prompts.prompt_text`
 * ile aynı biçim) ve değişken satırları `prompt_variables`'a yazılır — yani
 * kaydet/yeniden aç sonrası yapı birebir korunur. Generator şablonlarıyla
 * hiçbir veri modeli paylaşılmaz; yalnızca `PromptComposer` altyapısı ortaktır.
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
  const { t } = useTranslation();
  const composerRef = useRef<ComposerHandle>(null);
  const [tab, setTab] = useState<"template" | "preview">("template");
  const activeTab = variables.length === 0 ? "template" : tab;
  const [creating, setCreating] = useState<{ range: EditorSelection; selectedText: string } | null>(null);
  const [editingVariable, setEditingVariable] = useState<DraftVariable | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  const usage = useMemo(() => tokenUsageMap(value), [value]);
  const items: PickerItem[] = variables.map((variable) => ({
    id: variable.tempId,
    name: variable.name,
    label: variable.name,
    description: variable.description || variable.defaultValue || undefined,
    group: "all",
    usage: usage.get(variable.name) ?? 0,
  }));
  const filters: PickerFilter[] = [
    { id: "all", label: t("composer.filterAll") },
    { id: "unused", label: t("composer.filterUnused") },
    { id: "used", label: t("composer.filterUsed") },
  ];
  const definedNames = new Set(variables.map((variable) => variable.name));

  function handleSubmitCreate(values: { name: string; defaultValue: string; description: string; replaceAll: boolean; existing: boolean }) {
    if (!creating) return;
    const { range, selectedText } = creating;
    if (values.replaceAll && selectedText) {
      onChange(replaceAllOccurrencesWithToken(value, selectedText, values.name));
    } else {
      composerRef.current?.insertToken(values.name, range);
    }
    if (!values.existing) {
      onVariablesChange([
        ...variables,
        { tempId: makeTempId(), name: values.name, defaultValue: values.defaultValue, description: values.description },
      ]);
    }
    setCreating(null);
  }

  function handleEditVariable(values: { name: string; defaultValue: string; description: string }) {
    if (!editingVariable) return;
    const nextText = values.name !== editingVariable.name ? renameToken(value, editingVariable.name, values.name) : value;
    if (nextText !== value) onChange(nextText);
    onVariablesChange(
      variables.map((variable) => (variable.tempId === editingVariable.tempId ? { ...variable, ...values } : variable)),
    );
    setEditingVariable(null);
  }

  function handleDeleteVariable(variable: DraftVariable) {
    onChange(removeToken(value, variable.name));
    onVariablesChange(variables.filter((item) => item.tempId !== variable.tempId));
  }

  const existingNames = variables
    .filter((variable) => variable.tempId !== editingVariable?.tempId)
    .map((variable) => variable.name.toLowerCase());

  const previewText = resolvePromptText(
    value,
    Object.fromEntries(variables.map((variable) => [variable.name, previewValues[variable.name] ?? variable.defaultValue])),
  );

  const orphanTokens = extractVariableTokenNames(value).filter((name) => !definedNames.has(name));

  const tabSwitcher = (
    <div className="flex rounded-md border border-border p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setTab("template")}
        className={cn(
          "flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors",
          activeTab === "template" ? "bg-accent-surface text-text" : "text-text-muted hover:text-text",
        )}
      >
        <FileText size={12} /> {t("variable.templateTab")}
      </button>
      <button
        type="button"
        onClick={() => setTab("preview")}
        disabled={variables.length === 0}
        title={variables.length === 0 ? t("variable.previewDisabledHint") : undefined}
        className={cn(
          "flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors disabled:opacity-40",
          activeTab === "preview" ? "bg-accent-surface text-text" : "text-text-muted hover:text-text",
        )}
      >
        <Eye size={12} /> {t("variable.previewTab")}
      </button>
    </div>
  );

  const list = (
    <VariableList
      variables={variables}
      promptText={value}
      onEdit={(variable) => setEditingVariable(variable)}
      onDelete={handleDeleteVariable}
    />
  );

  return (
    <div className={cn("space-y-3", className)}>
      <PromptComposer
        ref={composerRef}
        mode="variable"
        id={id}
        value={value}
        onChange={onChange}
        items={items}
        filters={filters}
        tokenTone={(name) => (definedNames.has(name) ? "variable" : "unknown")}
        placeholder={placeholder}
        minRows={rows}
        ariaLabel={t("prompt.promptTextHeading")}
        required
        leading={tabSwitcher}
        hideEditor={activeTab === "preview"}
        onCreateNew={({ range, selectedText }) => setCreating({ range, selectedText })}
        onConvertSelection={({ range, selectedText }) => setCreating({ range, selectedText })}
        panelExtra={variables.length > 0 ? list : undefined}
      />

      {activeTab === "preview" && (
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
                  onChange={(event) => setPreviewValues((prev) => ({ ...prev, [variable.name]: event.target.value }))}
                  className="h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-text"
                />
              </div>
            ))}
          </div>
          {Object.keys(previewValues).length > 0 && (
            <button type="button" onClick={() => setPreviewValues({})} className="text-xs font-medium text-primary hover:underline">
              {t("variable.resetToDefaults")}
            </button>
          )}
        </div>
      )}

      {orphanTokens.length > 0 && (
        <p className="text-xs text-warning">
          {t("variable.orphanTokensWarning", { tokens: orphanTokens.map((name) => `{${name}}`).join(", ") })}
        </p>
      )}

      {list}

      {creating && (
        <VariableCreateModal
          selectedText={creating.selectedText}
          occurrenceCount={creating.selectedText ? countRawOccurrences(value, creating.selectedText) : 0}
          variables={variables}
          onClose={() => setCreating(null)}
          onSubmit={handleSubmitCreate}
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
