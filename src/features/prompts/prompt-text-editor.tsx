"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Eye } from "@/components/icons/eye";
import { FileText } from "@/components/icons/file-text";
import { Maximize2 } from "@/components/icons/maximize-2";
import {
  countRawOccurrences,
  definableOrphanNames,
  extractVariableTokenNames,
  replaceAllOccurrencesWithToken,
  resolvePromptText,
} from "@/lib/prompt-variables";
import { removeToken, renameToken, tokenUsageMap } from "@/lib/prompt-doc";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import {
  clearConditionsOn,
  describeOptions,
  effectiveVariableValues,
  emptySpec,
  isChoiceType,
  renameConditionTarget,
} from "@/lib/prompt-variable-types";
import { useTranslation } from "@/lib/i18n/language-provider";
import { catalogFieldToVariable, type CatalogFieldLike } from "@/lib/prompt-variable-catalog";
import { PromptComposer, type ComposerHandle } from "@/features/content/prompt-composer/prompt-composer";
import type { PickerFilter, PickerItem } from "@/features/content/prompt-composer/insert-picker";
import type { EditorSelection } from "@/features/content/prompt-composer/prompt-doc-editor";
import { VariableCreateModal } from "./variable-create-modal";
import { VariableEditorModal } from "./variable-editor-modal";
import { VariableList } from "./variable-list";
import { VariableField } from "./variable-field";
import type { VariableFormValues } from "./variable-spec-editor";
import { PromptFullscreenEditor } from "./prompt-fullscreen-editor";
import { makeTempId, type DraftVariable } from "./draft-variable";

/** Bir promptun en çok değişken sayısı (`prompt_variables` / `import_prompts` ile aynı). */
const MAX_VARIABLES = 30;

// 196 alanlık katalog yalnızca seçici açılınca yüklenir (ana pakete girmez).
const FieldCatalogPicker = dynamic(() => import("@/features/prompts/field-catalog-picker").then((m) => m.FieldCatalogPicker), { ssr: false });

export type { DraftVariable };

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
  onOpenPresets,
  presetCount,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  variables: DraftVariable[];
  onVariablesChange: (variables: DraftVariable[]) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Tam ekran yazma ekranının üstündeki "Hazır ayarlar" düğmesi (form Hazır ayarlar panelini açar); verilmezse düğme çizilmez. */
  onOpenPresets?: () => void;
  /** Uygulanan hazır ayar/alan sayısı (tam ekrandaki rozet). */
  presetCount?: number;
}) {
  const { t } = useTranslation();
  const composerRef = useRef<ComposerHandle>(null);
  const [tab, setTab] = useState<"template" | "preview">("template");
  const activeTab = variables.length === 0 ? "template" : tab;
  const [creating, setCreating] = useState<{ range: EditorSelection; selectedText: string } | null>(null);
  const [editingVariable, setEditingVariable] = useState<DraftVariable | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [catalogRange, setCatalogRange] = useState<EditorSelection | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Tam ekranda tanımsız bir jetona "Düzenle" denince geçici açılan taslak: pencere kaydedilmeden kapanırsa geri alınır.
  const pendingDraftRef = useRef<string | null>(null);

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

  /** Tam ekran: jetonun değişkenini düzenleme penceresini açar; tanımsız (yetim) jeton önce geçici bir taslakla tanımlanır. */
  function handleEditToken(name: string) {
    const existing = variables.find((variable) => variable.name === name);
    if (existing) {
      setEditingVariable(existing);
      return;
    }
    const draft: DraftVariable = { ...emptySpec("text"), tempId: makeTempId(), name, defaultValue: "", description: "" };
    pendingDraftRef.current = draft.tempId;
    onVariablesChange([...variables, draft]);
    setEditingVariable(draft);
  }

  function closeVariableEditor() {
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (pending && editingVariable?.tempId === pending) onVariablesChange(variables.filter((variable) => variable.tempId !== pending));
    setEditingVariable(null);
  }

  function handleEditVariable(values: VariableFormValues) {
    if (!editingVariable) return;
    pendingDraftRef.current = null;
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
  // Değişken adına benzeyen yetim jetonlar tek dokunuşla tanımlanabilir (JSON/kod parantezleri sayılmaz); sunucudaki sınır 30.
  const definableOrphans = definableOrphanNames(value, definedNames).slice(0, Math.max(0, MAX_VARIABLES - variables.length));

  /** Tanımsız jetonları boş metin değişkeni yapar: varsayılan değer ve açıklamayı yazar sonradan düzenler. */
  function defineAllOrphans() {
    if (definableOrphans.length === 0) return;
    onVariablesChange([
      ...variables,
      ...definableOrphans.map((name): DraftVariable => ({ ...emptySpec("text"), tempId: makeTempId(), name, defaultValue: "", description: "" })),
    ]);
  }

  const fullscreenButton = (
    <IconButton
      onClick={() => setFullscreen(true)}
      disabled={activeTab === "preview"}
      label={t("fullscreen.open")}
      className="shrink-0 disabled:opacity-40 disabled:hover:bg-transparent"
      data-testid="open-fullscreen"
    >
      <Maximize2 size={16} aria-hidden />
    </IconButton>
  );

  const tabClass = (active: boolean) =>
    cn(
      "-mb-px flex h-10 items-center gap-1.5 border-b-2 px-3 text-label font-semibold transition-colors disabled:opacity-50",
      active ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text",
    );
  const tabSwitcher = (
    <div className="flex" role="tablist">
      <button type="button" role="tab" aria-selected={activeTab === "template"} onClick={() => setTab("template")} className={tabClass(activeTab === "template")}>
        <FileText size={16} aria-hidden /> {t("variable.templateTab")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "preview"}
        onClick={() => setTab("preview")}
        disabled={variables.length === 0}
        title={variables.length === 0 ? t("variable.previewDisabledHint") : undefined}
        className={tabClass(activeTab === "preview")}
      >
        <Eye size={16} aria-hidden /> {t("variable.previewTab")}
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
        leading={
          <div className="flex items-center justify-between gap-2 pr-1">
            {tabSwitcher}
            {fullscreenButton}
          </div>
        }
        hideEditor={activeTab === "preview"}
        onCreateNew={({ range, selectedText }) => setCreating({ range, selectedText })}
        onConvertSelection={({ range, selectedText }) => setCreating({ range, selectedText })}
        onOpenCatalog={() => setCatalogRange(composerRef.current?.getPendingRange() ?? cursorRange())}
        panelExtra={variables.length > 0 ? list : undefined}
      />

      {activeTab === "preview" && (
        <div className="space-y-3 rounded-md card-inset p-3">
          <div className="whitespace-pre-wrap break-words font-mono text-small text-text">{previewText}</div>
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
            <button type="button" onClick={() => setPreviewValues({})} className="text-caption font-medium text-primary hover:underline">
              {t("variable.resetToDefaults")}
            </button>
          )}
        </div>
      )}

      {orphanTokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="orphan-tokens">
          <p className="min-w-0 flex-1 text-caption text-warning">
            {t("variable.orphanTokensWarning", { tokens: orphanTokens.map((name) => `{${name}}`).join(", ") })}
          </p>
          {definableOrphans.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={defineAllOrphans} data-testid="define-all-orphans">
              {t("variable.defineAll", { count: definableOrphans.length })}
            </Button>
          )}
        </div>
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
      {fullscreen && (
        <PromptFullscreenEditor
          value={value}
          onChange={onChange}
          variables={variables}
          onVariablesChange={onVariablesChange}
          tokenTone={(name) => (definedNames.has(name) ? "variable" : "unknown")}
          placeholder={placeholder}
          onEditVariable={handleEditToken}
          onOpenPresets={onOpenPresets}
          presetCount={presetCount}
          onClose={() => setFullscreen(false)}
        />
      )}
      {editingVariable && (
        <VariableEditorModal
          editing={editingVariable}
          controllers={variables.slice(0, Math.max(0, variables.findIndex((item) => item.tempId === editingVariable.tempId)))}
          existingNames={existingNames}
          onClose={closeVariableEditor}
          onSubmit={handleEditVariable}
        />
      )}
    </div>
  );
}
