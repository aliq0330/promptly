"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ImageIcon, LayoutGrid } from "lucide-react";
import {
  countRawOccurrences,
  countVariableUsages,
  extractVariableTokenNames,
  replaceAllOccurrencesWithToken,
} from "@/lib/prompt-variables";
import { removeToken, renameToken, tokenUsageMap } from "@/lib/prompt-doc";
import { studioChipClassName } from "@/features/content/compose-form";
import { cn } from "@/lib/utils";
import {
  clearConditionsOn,
  describeOptions,
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
import type { VariableFormValues } from "./variable-spec-editor";
import { ImageHelpPanel } from "./image-help-panel";

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

/** Formun (ve sağ sütunun) düzenleyicinin değişken akışlarını dışarıdan açabilmesi için: "Yeni", kalem, çöp kutusu, çipe dokunma. */
export interface PromptTextEditorHandle {
  /** "Değişkeni düzenle" penceresini açar. */
  editVariable(variable: DraftVariable): void;
  /** Değişkeni siler ve metindeki tüm `{ad}` jetonlarını kaldırır. */
  deleteVariable(variable: DraftVariable): void;
  /** İmleç konumuna yeni değişken oluşturma penceresini açar. */
  createVariable(): void;
  /** Var olan değişkeni imlece `{ad}` jetonu olarak ekler. */
  insertVariable(name: string): void;
}

/**
 * Normal prompt değişken düzenleyicisi (Bölüm 9.136; tam ekran stüdyo düzeni docs/history/286-*).
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
 *
 * Önizleme ve değer alanları artık formun sağ sütunundadır (`PromptLivePreview`): değerler (`previewValues`) formda tutulur, bu
 * bileşen yalnız metni ve değişken tanımlarını düzenler; sağ sütunun kalem/"Yeni" düğmeleri `ref` ile akışları açar.
 */
export const PromptTextEditor = forwardRef<
  PromptTextEditorHandle,
  {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    variables: DraftVariable[];
    onVariablesChange: (variables: DraftVariable[]) => void;
    /** Sağ sütundaki değerler (ad → değer): ad değişince/değişken düzenlenince eski değer temizlenir. */
    previewValues: Record<string, string>;
    onPreviewValuesChange: (values: Record<string, string>) => void;
    rows?: number;
    placeholder?: string;
    className?: string;
    /** The image the author already picked in the form (feeds "Görselden yardım" without a second upload). */
    visionFile?: File | null;
    /** Düzenleyiciye odaklanma durumu (telefonda klavye üstü dock'u açar). */
    onFocusChange?: (focused: boolean) => void;
  }
>(function PromptTextEditor(
  { id = "prompt-text", value, onChange, variables, onVariablesChange, previewValues, onPreviewValuesChange, rows = 6, placeholder, className, visionFile, onFocusChange },
  ref,
) {
  const { t } = useTranslation();
  const composerRef = useRef<ComposerHandle>(null);
  const [creating, setCreating] = useState<{ range: EditorSelection; selectedText: string } | null>(null);
  const [editingVariable, setEditingVariable] = useState<DraftVariable | null>(null);
  const [catalogRange, setCatalogRange] = useState<EditorSelection | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  function updatePreview(update: (prev: Record<string, string>) => Record<string, string>) {
    onPreviewValuesChange(update(previewValues));
  }

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
    updatePreview((prev) => {
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
    updatePreview((prev) => {
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

  const orphanTokens = extractVariableTokenNames(value).filter((name) => !definedNames.has(name));
  const unusedCount = variables.filter((variable) => countVariableUsages(value, variable.name) === 0).length;

  useImperativeHandle(
    ref,
    () => ({
      editVariable: (variable) => setEditingVariable(variable),
      deleteVariable: handleDeleteVariable,
      createVariable: () => setCreating({ range: cursorRange(), selectedText: "" }),
      insertVariable: (name) => composerRef.current?.insertToken(name, cursorRange()),
    }),
    // Handlers close over the current text/variables; the handle is rebuilt whenever they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, variables, previewValues],
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
    <div className={cn("space-y-2.5", className)}>
      <PromptComposer
        ref={composerRef}
        mode="variable"
        studio
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
        onFocusChange={onFocusChange}
        onCreateNew={({ range, selectedText }) => setCreating({ range, selectedText })}
        onConvertSelection={({ range, selectedText }) => setCreating({ range, selectedText })}
        onOpenCatalog={() => setCatalogRange(composerRef.current?.getPendingRange() ?? cursorRange())}
        panelExtra={variables.length > 0 ? list : undefined}
        toolbarExtra={
          <>
            <button
              type="button"
              data-testid="composer-catalog"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setCatalogRange(cursorRange())}
              className={studioChipClassName()}
            >
              <LayoutGrid size={14} aria-hidden /> {t("studio.catalog")}
            </button>
            <button type="button" aria-expanded={helpOpen} data-testid="composer-image-help" onClick={() => setHelpOpen((open) => !open)} className={studioChipClassName()}>
              <ImageIcon size={14} aria-hidden /> {t("studio.imageHelp")}
            </button>
          </>
        }
      />

      {helpOpen && (
        <ImageHelpPanel
          bare
          promptText={value}
          variables={variables}
          sourceFile={visionFile}
          onApplyPrompt={(text, mode) => onChange(mode === "replace" || !value.trim() ? text : `${value}\n\n${text}`)}
          onApplyVariables={handleVisionApply}
        />
      )}

      <div data-editor-stats="" className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.75rem] text-text-muted">
        <span>{t("studio.chars", { count: value.length })}</span>
        <span>{t("studio.variableCount", { count: variables.length })}</span>
        {variables.length > 0 &&
          (unusedCount === 0 ? (
            <span className="font-semibold text-primary">{t("studio.allUsed")}</span>
          ) : (
            <span className="font-semibold text-warning">{t("studio.someUnused", { count: unusedCount })}</span>
          ))}
      </div>

      {orphanTokens.length > 0 && (
        <p className="text-xs text-warning">
          {t("variable.orphanTokensWarning", { tokens: orphanTokens.map((name) => `{${name}}`).join(", ") })}
        </p>
      )}

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
});
