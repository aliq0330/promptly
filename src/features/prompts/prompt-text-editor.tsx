"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Blocks, Eye, FileText } from "lucide-react";
import {
  countRawOccurrences,
  extractVariableTokenNames,
  replaceAllOccurrencesWithToken,
  resolvePromptText,
} from "@/lib/prompt-variables";
import { removeToken, renameToken, tokenUsageMap } from "@/lib/prompt-doc";
import { cn } from "@/lib/utils";
import {
  clearConditionsOn,
  describeOptions,
  effectiveVariableValues,
  isChoiceType,
  renameConditionTarget,
} from "@/lib/prompt-variable-types";
import { useTranslation } from "@/lib/i18n/language-provider";
import { catalogFieldToVariable, type CatalogFieldLike } from "@/lib/prompt-variable-catalog";
import { suggestionToVariable, type MatchedVariableValue } from "@/lib/prompt-variable-vision";
import type { CleanSuggestedField } from "@/lib/generator-vision-mapping";
import type { PromptVariableSpec } from "@/types";
import { PromptComposer, type ComposerHandle } from "@/features/content/prompt-composer/prompt-composer";
import type { PickerFilter, PickerItem } from "@/features/content/prompt-composer/insert-picker";
import type { EditorSelection } from "@/features/content/prompt-composer/prompt-doc-editor";
import { VariableCreateModal } from "./variable-create-modal";
import { VariableEditorModal } from "./variable-editor-modal";
import { VariableList } from "./variable-list";
import { VariableField } from "./variable-field";
import type { VariableFormValues } from "./variable-spec-editor";
import { VariableVisionAssist } from "./variable-vision-assist";

// 196 alanlık katalog yalnızca seçici açılınca yüklenir (ana pakete girmez).
const FieldCatalogPicker = dynamic(() => import("@/features/prompts/field-catalog-picker").then((m) => m.FieldCatalogPicker), { ssr: false });

/** A not-yet-persisted variable living only in this form's own state — gets a real DB row (with a real `id`) only once the prompt itself is created/updated (see `replaceVariablesForPrompt`, `src/lib/supabase/prompt-variables.ts`). */
export interface DraftVariable extends PromptVariableSpec {
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
  const [catalogRange, setCatalogRange] = useState<EditorSelection | null>(null);

  const usage = useMemo(() => tokenUsageMap(value), [value]);
  const items: PickerItem[] = variables.map((variable) => ({
    id: variable.tempId,
    name: variable.name,
    label: variable.name,
    description:
      variable.description ||
      (isChoiceType(variable.type) ? describeOptions(variable.options) : variable.defaultValue) ||
      undefined,
    group: "all",
    usage: usage.get(variable.name) ?? 0,
  }));
  const filters: PickerFilter[] = [
    { id: "all", label: t("composer.filterAll") },
    { id: "unused", label: t("composer.filterUnused") },
    { id: "used", label: t("composer.filterUsed") },
  ];
  const definedNames = new Set(variables.map((variable) => variable.name));

  function handleSubmitCreate(values: VariableFormValues & { replaceAll: boolean; existing: boolean }) {
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
        {
          tempId: makeTempId(),
          name: values.name,
          defaultValue: values.defaultValue,
          description: values.description,
          type: values.type,
          options: values.options,
          config: values.config,
        },
      ]);
    }
    setCreating(null);
  }

  /** Bir tıklama anındaki imleç: seçili metin silinmesin diye seçimin SONUNA ekler. */
  function cursorRange(): EditorSelection {
    const sel = composerRef.current?.getSelection() ?? { start: value.length, end: value.length };
    return { start: sel.end, end: sel.end };
  }

  /** Yeni değişken taslaklarını ekler ve adlarını tek adımda imlece jeton olarak yerleştirir. */
  function addDrafts(drafts: Omit<DraftVariable, "tempId">[], range: EditorSelection) {
    if (drafts.length === 0) return;
    onVariablesChange([...variables, ...drafts.map((draft) => ({ ...draft, tempId: makeTempId() }))]);
    composerRef.current?.insertTokens(drafts.map((draft) => draft.name), range);
  }

  function takenNames(): Set<string> {
    return new Set(variables.map((variable) => variable.name.toLowerCase()));
  }

  function handleInsertCatalog(fields: CatalogFieldLike[]) {
    const range = catalogRange ?? cursorRange();
    const taken = takenNames();
    const drafts = fields.map((field) => {
      const draft = catalogFieldToVariable(field, taken);
      taken.add(draft.name.toLowerCase());
      return draft;
    });
    setCatalogRange(null);
    addDrafts(drafts, range);
  }

  function handleVisionApply({ values, suggestions }: { values: MatchedVariableValue[]; suggestions: CleanSuggestedField[] }) {
    const byName = new Map(values.map((row) => [row.name, row.value]));
    const updated = variables.map((variable) => (byName.has(variable.name) ? { ...variable, defaultValue: byName.get(variable.name)! } : variable));
    // Önizlemede eski elle girilmiş değer yeni varsayılanı gölgelemesin.
    setPreviewValues((prev) => {
      const next = { ...prev };
      for (const name of byName.keys()) delete next[name];
      return next;
    });
    const range = cursorRange();
    const taken = takenNames();
    const drafts = suggestions.map((suggestion) => {
      const draft = suggestionToVariable(suggestion, taken);
      taken.add(draft.name.toLowerCase());
      return draft;
    });
    // Tek `onVariablesChange` çağrısı: varsayılan güncellemeleri + yeni değişkenler birlikte.
    onVariablesChange([...updated, ...drafts.map((draft) => ({ ...draft, tempId: makeTempId() }))]);
    if (drafts.length > 0) composerRef.current?.insertTokens(drafts.map((draft) => draft.name), range);
  }

  function handleEditVariable(values: VariableFormValues) {
    if (!editingVariable) return;
    const nextText = values.name !== editingVariable.name ? renameToken(value, editingVariable.name, values.name) : value;
    if (nextText !== value) onChange(nextText);
    const edited = variables.map((variable) => (variable.tempId === editingVariable.tempId ? { ...variable, ...values } : variable));
    // Variables that were watching the old name keep watching it under the new one.
    onVariablesChange(values.name !== editingVariable.name ? renameConditionTarget(edited, editingVariable.name, values.name) : edited);
    // A preview value typed for the old kind/name may no longer be valid.
    setPreviewValues((prev) => {
      const next = { ...prev };
      delete next[editingVariable.name];
      delete next[values.name];
      return next;
    });
    setEditingVariable(null);
  }

  function handleDeleteVariable(variable: DraftVariable) {
    onChange(removeToken(value, variable.name));
    // A deleted variable can no longer control anything: drop the conditions that watched it.
    onVariablesChange(clearConditionsOn(variables.filter((item) => item.tempId !== variable.tempId), variable.name));
  }

  const existingNames = variables
    .filter((variable) => variable.tempId !== editingVariable?.tempId)
    .map((variable) => variable.name.toLowerCase());

  // Preview values go through the same condition logic as the live prompt: hidden variables add nothing.
  const { values: previewEffective, visible: previewVisible } = effectiveVariableValues(variables, previewValues);
  const previewText = resolvePromptText(value, previewEffective);

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

      {activeTab === "template" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setCatalogRange(cursorRange())}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-text transition-colors hover:bg-accent-surface"
          >
            <Blocks size={14} className="text-primary" aria-hidden="true" /> {t("variable.addFromCatalog")}
          </button>
          <VariableVisionAssist
            promptText={value}
            variables={variables}
            onApply={handleVisionApply}
          />
        </div>
      )}

      {activeTab === "preview" && (
        <div className="space-y-3 rounded-md border border-border bg-background p-3">
          <div className="whitespace-pre-wrap break-words font-mono text-sm text-text">{previewText}</div>
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            {variables.filter((variable) => previewVisible[variable.name] !== false).map((variable) => (
              <VariableField
                key={variable.tempId}
                variable={{ ...variable, id: variable.tempId }}
                value={previewValues[variable.name] ?? variable.defaultValue}
                onChange={(next) => setPreviewValues((prev) => ({ ...prev, [variable.name]: next }))}
              />
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

      {catalogRange && (
        <FieldCatalogPicker
          existingFields={variables.map((variable) => ({ label: variable.name.replace(/_/g, " ") }))}
          hideOptionPreview
          onClose={() => setCatalogRange(null)}
          onInsert={handleInsertCatalog}
        />
      )}
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
          controllers={variables.slice(0, Math.max(0, variables.findIndex((item) => item.tempId === editingVariable.tempId)))}
          existingNames={existingNames}
          onClose={() => setEditingVariable(null)}
          onSubmit={handleEditVariable}
        />
      )}
    </div>
  );
}
