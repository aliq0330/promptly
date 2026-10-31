"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Braces, Eye, ImageIcon, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Portal } from "@/components/ui/portal";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import { catalogFieldToVariable, type CatalogFieldLike } from "@/lib/prompt-variable-catalog";
import { effectiveVariableValues, clearConditionsOn, renameConditionTarget } from "@/lib/prompt-variable-types";
import { suggestionToVariable, type MatchedVariableValue } from "@/lib/prompt-variable-vision";
import { removeToken, renameToken, tokenRanges, tokenUsageMap } from "@/lib/prompt-doc";
import { countRawOccurrences, extractVariableTokenNames, replaceAllOccurrencesWithToken, segmentPromptText } from "@/lib/prompt-variables";
import type { CleanSuggestedField } from "@/lib/generator-vision-mapping";
import { useKeyboardViewport } from "@/lib/use-keyboard-viewport";
import { cn } from "@/lib/utils";
import { PromptDocEditor, type EditorSelection, type PromptDocEditorHandle } from "@/features/content/prompt-composer/prompt-doc-editor";
import { ImageHelpPanel } from "./image-help-panel";
import type { DraftVariable } from "./prompt-text-editor";
import { VariableAddSheet } from "./variable-add-sheet";
import { VariableConvertSheet } from "./variable-convert-sheet";
import { VariableEditSheet } from "./variable-edit-sheet";
import { VariableField } from "./variable-field";
import { VariableSheetFrame } from "./variable-sheet-frame";
import type { VariableFormValues } from "./variable-spec-editor";

// 196 alanlık katalog yalnızca seçici açılınca yüklenir (ana pakete girmez).
const FieldCatalogPicker = dynamic(() => import("@/features/prompts/field-catalog-picker").then((m) => m.FieldCatalogPicker), { ssr: false });

type Sheet =
  | { kind: "add"; range: EditorSelection }
  | { kind: "convert"; range: EditorSelection; text: string }
  | { kind: "edit"; tempId: string }
  | { kind: "vision" }
  | { kind: "catalog"; range: EditorSelection };

function makeTempId(): string {
  return `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newTextVariable(name: string, defaultValue = ""): DraftVariable {
  return { tempId: makeTempId(), name, defaultValue, description: "", type: "text", options: [], config: {} };
}

const SHORTCUT_CLASS =
  "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-strong bg-surface-soft px-3.5 text-label font-medium text-text-secondary transition-colors duration-200 ease-soft hover:border-primary/50 hover:text-text";
const DOCK_BUTTON_MOUSE = (event: React.MouseEvent) => event.preventDefault();

/**
 * Prompt metni TAM EKRAN yazma katmanı (docs/history/288-*, kullanıcının seçtiği mockup): üstte başlık + "Bitti", altında bu bölümle ilgili üç
 * kısayol (Hazır ayarlar · Ek alanlar · Görselden yardım), ortada çerçevesiz yazma alanı, altta tek sabit çubuk. Alt çubuk duruma göre
 * değişir: normalde "Değişken" + sayaç + Önizleme; bir kelime seçiliyken "Değişken yap"; bir `{değişken}` jetonu seçiliyken "Düzenle".
 * Tüm değişken sayfaları (`VariableAddSheet` / `VariableConvertSheet` / `VariableEditSheet`) tek bir alt sayfa durumundan açılır.
 * Ekran klavyesi açıkken katman görünür alana oturur (alt çubuk klavyenin ÜSTÜNDE kalır). Z-sırası: z-49 — `Modal`lar (z-50) üstüne açılır.
 */
export function PromptFullscreenEditor({
  id,
  value,
  onChange,
  variables,
  onVariablesChange,
  placeholder,
  visionFile,
  extraCount,
  onOpenExtra,
  onClose,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  variables: DraftVariable[];
  onVariablesChange: (variables: DraftVariable[]) => void;
  placeholder?: string;
  visionFile?: File | null;
  /** Uygulanmış hazır ayar/ek alan sayısı ("Ek alanlar" düğmesinde rozet). */
  extraCount: number;
  onOpenExtra: (tab: "community" | "fields") => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const keyboard = useKeyboardViewport();
  const docRef = useRef<PromptDocEditorHandle>(null);
  const [selection, setSelection] = useState<EditorSelection>({ start: value.length, end: value.length });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [previewOn, setPreviewOn] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  // Açılır açılmaz imleç metnin sonunda: yazmaya hazır.
  useEffect(() => {
    docRef.current?.setSelection(value.length, value.length);
    // yalnız açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    lockBodyScroll();
    return unlockBodyScroll;
  }, []);

  // Escape: üstte bir `Modal` (alt sayfa, hazır ayar penceresi…) varsa onu kapatır, burası kapanmaz; yoksa "Bitti".
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-prompt-fullscreen])')) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const usage = tokenUsageMap(value);
  const definedNames = new Set(variables.map((variable) => variable.name));
  const orphanTokens = extractVariableTokenNames(value).filter((name) => !definedNames.has(name));
  const takenNames = () => new Set(variables.map((variable) => variable.name.toLowerCase()));

  const hasSelection = selection.end > selection.start;
  const selectedText = hasSelection ? value.slice(selection.start, selection.end) : "";
  const selectedToken = hasSelection ? (tokenRanges(value).find((range) => range.start === selection.start && range.end === selection.end) ?? null) : null;
  const tokenVariable = selectedToken ? variables.find((variable) => variable.name === selectedToken.name) : undefined;
  const previewing = previewOn && variables.length > 0;
  const dock: "main" | "word" | "token" = previewing ? "main" : selectedToken ? "token" : hasSelection && selectedText.trim() ? "word" : "main";

  /** Bir tıklama anındaki imleç: seçili metin silinmesin diye seçimin SONUNA ekler. */
  function cursorRange(): EditorSelection {
    const sel = docRef.current?.getSelection() ?? { start: value.length, end: value.length };
    return { start: sel.end, end: sel.end };
  }

  /** Jetonları verilen aralığa yazar; daralmış imleçte komşu harf/jeton varsa boşluk bırakır (jeton kelimeye yapışmasın). */
  function insertTokens(names: string[], range: EditorSelection) {
    const editor = docRef.current;
    if (!editor || names.length === 0) return;
    let text = names.map((name) => `{${name}}`).join(", ");
    if (range.start === range.end) {
      const before = value[range.start - 1];
      const after = value[range.end];
      if (before !== undefined && (/[\p{L}\p{N}]/u.test(before) || before === "}")) text = ` ${text}`;
      if (after !== undefined && (/[\p{L}\p{N}]/u.test(after) || after === "{")) text = `${text} `;
    }
    editor.replaceRange(range.start, range.end, text);
  }

  function openSheet(next: Sheet) {
    docRef.current?.blur(); // klavyeyi kapat: sayfa klavyenin altında kalmasın
    setSheet(next);
  }

  function closeSheet() {
    setSheet(null);
  }

  // ---- Ekle ----
  function handleCreateByName(name: string) {
    if (sheet?.kind !== "add") return;
    const range = sheet.range;
    setSheet(null);
    onVariablesChange([...variables, newTextVariable(name)]);
    insertTokens([name], range);
  }

  function handleInsertExisting(name: string) {
    if (sheet?.kind !== "add") return;
    const range = sheet.range;
    setSheet(null);
    insertTokens([name], range);
  }

  function handleInsertCatalog(fields: CatalogFieldLike[]) {
    const range = sheet?.kind === "catalog" ? sheet.range : cursorRange();
    const taken = takenNames();
    const drafts = fields.map((field) => {
      const draft = catalogFieldToVariable(field, taken);
      taken.add(draft.name.toLowerCase());
      return { ...draft, tempId: makeTempId() };
    });
    setSheet(null);
    if (drafts.length === 0) return;
    onVariablesChange([...variables, ...drafts]);
    insertTokens(drafts.map((draft) => draft.name), range);
  }

  // ---- Dönüştür ----
  function handleConvert(values: { name: string; replaceAll: boolean; existing: boolean }) {
    if (sheet?.kind !== "convert") return;
    const { range, text } = sheet;
    setSheet(null);
    if (values.replaceAll && text) onChange(replaceAllOccurrencesWithToken(value, text, values.name));
    else insertTokens([values.name], range);
    if (!values.existing) onVariablesChange([...variables, newTextVariable(values.name, text)]);
  }

  // ---- Düzenle / sil ----
  const editing = sheet?.kind === "edit" ? variables.find((variable) => variable.tempId === sheet.tempId) : undefined;

  function handleEdit(values: VariableFormValues) {
    if (!editing) return;
    const nextText = values.name !== editing.name ? renameToken(value, editing.name, values.name) : value;
    if (nextText !== value) onChange(nextText);
    const edited = variables.map((variable) => (variable.tempId === editing.tempId ? { ...variable, ...values } : variable));
    // Eski adı izleyen koşullar yeni adı izlemeye devam eder.
    onVariablesChange(values.name !== editing.name ? renameConditionTarget(edited, editing.name, values.name) : edited);
    setPreviewValues((prev) => {
      const next = { ...prev };
      delete next[editing.name];
      delete next[values.name];
      return next;
    });
    setSheet(null);
  }

  function handleDelete() {
    if (!editing) return;
    onChange(removeToken(value, editing.name));
    // Silinen değişken artık hiçbir şeyi denetleyemez: onu izleyen koşullar kalkar.
    onVariablesChange(clearConditionsOn(variables.filter((item) => item.tempId !== editing.tempId), editing.name));
    setSheet(null);
  }

  /** Seçili jeton: tanımlıysa düzenleme sayfası; tanımsız (yetim) ise önce metin değişkeni olarak tanımlanır. */
  function handleEditToken() {
    if (!selectedToken) return;
    if (tokenVariable) return openSheet({ kind: "edit", tempId: tokenVariable.tempId });
    const draft = newTextVariable(selectedToken.name);
    onVariablesChange([...variables, draft]);
    openSheet({ kind: "edit", tempId: draft.tempId });
  }

  function handleRemoveToken() {
    if (selectedToken) docRef.current?.replaceRange(selectedToken.start, selectedToken.end, "");
  }

  function clearSelection() {
    docRef.current?.setSelection(selection.end, selection.end);
  }

  // ---- Görselden yardım ----
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
      return { ...draft, tempId: makeTempId() };
    });
    // Tek `onVariablesChange` çağrısı: varsayılan güncellemeleri + yeni değişkenler birlikte.
    onVariablesChange([...updated, ...drafts]);
    if (drafts.length > 0) insertTokens(drafts.map((draft) => draft.name), range);
  }

  // Önizleme: aynı koşul mantığı (gizli değişken prompta hiçbir şey eklemez).
  const { values: previewEffective, visible: previewVisible } = effectiveVariableValues(variables, previewValues);
  const previewSegments = segmentPromptText(value, previewEffective);

  const overlayStyle: React.CSSProperties = keyboard ? { top: keyboard.top, height: keyboard.height } : { top: 0, bottom: 0 };
  const shortcutIcon = 15;

  return (
    <Portal>
      <div
        data-prompt-fullscreen=""
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-fullscreen-title"
        className="fixed inset-x-0 z-[49] flex flex-col bg-background text-text animate-fade-in"
        style={overlayStyle}
      >
        <header className="flex min-h-[60px] shrink-0 items-center gap-2 border-b border-border-soft pb-1 pl-[18px] pr-3 pt-[max(0.25rem,env(safe-area-inset-top))]">
          <h2 id="prompt-fullscreen-title" className="min-w-0 flex-1 truncate font-display text-h3 font-bold">
            {t("compose.promptText")}
          </h2>
          <Button type="button" onClick={onClose} data-testid="prompt-fullscreen-done">
            {t("promptEdit.done")}
          </Button>
        </header>

        <ScrollRow role="group" aria-label={t("promptEdit.shortcutsAria")} className="shrink-0 gap-2 border-b border-border-soft px-4 py-2.5" wrapperClassName="shrink-0">
          <button type="button" className={SHORTCUT_CLASS} onClick={() => onOpenExtra("community")} data-testid="prompt-open-presets">
            <Sparkles size={shortcutIcon} aria-hidden /> {t("promptEdit.presets")}
          </button>
          <button type="button" className={SHORTCUT_CLASS} onClick={() => onOpenExtra("fields")} data-testid="prompt-open-fields">
            <SlidersHorizontal size={shortcutIcon} aria-hidden /> {t("promptEdit.fields")}
            {extraCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-caption font-bold text-primary-foreground">{extraCount}</span>}
          </button>
          <button type="button" className={SHORTCUT_CLASS} onClick={() => openSheet({ kind: "vision" })} data-testid="prompt-open-vision">
            <ImageIcon size={shortcutIcon} aria-hidden /> {t("promptEdit.vision")}
          </button>
        </ScrollRow>

        {previewing && <div className="shrink-0 bg-primary-soft px-[18px] py-2 text-label font-semibold text-primary">{t("promptEdit.previewBanner")}</div>}

        {/* Metnin altındaki boş alana dokunmak yazmaya döner (imleç sona). */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onClick={(event) => {
            if (event.target === event.currentTarget && !previewing) docRef.current?.setSelection(value.length, value.length);
          }}
        >
          <PromptDocEditor
            ref={docRef}
            id={id}
            fill
            value={value}
            onChange={onChange}
            tokenTone={(name) => (definedNames.has(name) ? "variable" : "unknown")}
            placeholder={placeholder}
            minRows={10}
            ariaLabel={t("prompt.promptTextHeading")}
            required
            hidden={previewing}
            onSelectionChange={setSelection}
            onRequestInsert={() => openSheet({ kind: "add", range: cursorRange() })}
          />

          {previewing && (
            <div className="space-y-4 px-4 py-4">
              <p data-prompt-preview="" className="whitespace-pre-wrap break-words font-mono text-[16px] leading-7 text-text">
                {previewSegments.map((segment, index) =>
                  segment.isVariable ? (
                    <mark key={index} className="rounded-[5px] bg-primary-soft px-0.5 text-primary">
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
              </p>
              <div className="grid gap-3 border-t border-border-soft pt-4 sm:grid-cols-2">
                {variables
                  .filter((variable) => previewVisible[variable.name] !== false)
                  .map((variable) => (
                    <VariableField
                      key={variable.tempId}
                      variable={{ ...variable, id: variable.tempId }}
                      value={previewValues[variable.name] ?? variable.defaultValue}
                      onChange={(next) => setPreviewValues((prev) => ({ ...prev, [variable.name]: next }))}
                    />
                  ))}
              </div>
              {Object.keys(previewValues).length > 0 && (
                <button type="button" onClick={() => setPreviewValues({})} className="text-label font-semibold text-primary hover:underline">
                  {t("variable.resetToDefaults")}
                </button>
              )}
            </div>
          )}

          {!previewing && variables.length === 0 && !hasSelection && (
            <p className="flex items-center gap-2 px-4 pb-4 text-caption text-text-muted">
              <Braces size={14} aria-hidden /> {t("composer.hintTouchVariable")}
            </p>
          )}
          {orphanTokens.length > 0 && (
            <p className="px-4 pb-4 text-caption text-warning">{t("variable.orphanTokensWarning", { tokens: orphanTokens.map((name) => `{${name}}`).join(", ") })}</p>
          )}
        </div>

        <div
          data-prompt-dock={dock}
          className={cn(
            "flex shrink-0 items-center gap-2.5 border-t border-border-soft bg-surface px-3.5 pt-2.5",
            keyboard ? "pb-2.5" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          )}
        >
          {dock === "main" && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onMouseDown={DOCK_BUTTON_MOUSE}
                onClick={() => openSheet({ kind: "add", range: cursorRange() })}
                disabled={previewing}
                data-testid="prompt-add-variable"
              >
                <Braces size={18} aria-hidden /> {t("promptEdit.variableBtn")}
              </Button>
              <span className="min-w-0 flex-1 truncate text-caption text-text-muted">{t("promptEdit.stats", { variables: variables.length, chars: value.length })}</span>
              <button
                type="button"
                aria-pressed={previewing}
                disabled={variables.length === 0}
                title={variables.length === 0 ? t("variable.previewDisabledHint") : undefined}
                onMouseDown={DOCK_BUTTON_MOUSE}
                onClick={() => setPreviewOn((on) => !on)}
                data-testid="prompt-preview-toggle"
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-label font-medium transition-colors duration-200 ease-soft disabled:opacity-40",
                  previewing ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface-soft text-text-secondary hover:text-text",
                )}
              >
                <Eye size={16} aria-hidden /> {t("variable.previewTab")}
              </button>
            </>
          )}

          {dock === "word" && (
            <>
              <span className="min-w-0 flex-1 truncate font-mono text-small text-text-secondary">“{selectedText}”</span>
              <Button
                type="button"
                size="lg"
                className="shrink-0"
                onMouseDown={DOCK_BUTTON_MOUSE}
                onClick={() => openSheet({ kind: "convert", range: { ...selection }, text: selectedText })}
                data-testid="prompt-make-variable"
              >
                <Braces size={18} aria-hidden /> {t("promptEdit.makeVariable")}
              </Button>
              <button type="button" aria-label={t("promptEdit.clearSelection")} onMouseDown={DOCK_BUTTON_MOUSE} onClick={clearSelection} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary hover:text-text">
                <X size={18} aria-hidden />
              </button>
            </>
          )}

          {dock === "token" && selectedToken && (
            <>
              <span className="min-w-0 flex-1 truncate font-mono text-small text-primary">{`{${selectedToken.name}}`}</span>
              <Button type="button" size="lg" className="shrink-0" onMouseDown={DOCK_BUTTON_MOUSE} onClick={handleEditToken} data-testid="prompt-edit-variable">
                {tokenVariable ? t("composer.editToken") : t("promptEdit.tokenDefine")}
              </Button>
              <button type="button" aria-label={t("composer.removeToken")} onMouseDown={DOCK_BUTTON_MOUSE} onClick={handleRemoveToken} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary hover:text-danger">
                <Trash2 size={17} aria-hidden />
              </button>
              <button type="button" aria-label={t("promptEdit.clearSelection")} onMouseDown={DOCK_BUTTON_MOUSE} onClick={clearSelection} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary hover:text-text">
                <X size={18} aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>

      {sheet?.kind === "add" && (
        <VariableAddSheet
          variables={variables}
          usage={usage}
          onInsertExisting={handleInsertExisting}
          onCreate={handleCreateByName}
          onOpenLibrary={() => setSheet({ kind: "catalog", range: sheet.range })}
          onClose={closeSheet}
        />
      )}
      {sheet?.kind === "convert" && (
        <VariableConvertSheet
          selectedText={sheet.text}
          occurrenceCount={countRawOccurrences(value, sheet.text)}
          variables={variables}
          onClose={closeSheet}
          onSubmit={handleConvert}
        />
      )}
      {editing && (
        <VariableEditSheet
          editing={editing}
          controllers={variables.slice(0, Math.max(0, variables.findIndex((item) => item.tempId === editing.tempId)))}
          existingNames={variables.filter((variable) => variable.tempId !== editing.tempId).map((variable) => variable.name.toLowerCase())}
          usageCount={usage.get(editing.name) ?? 0}
          onClose={closeSheet}
          onSubmit={handleEdit}
          onDelete={handleDelete}
        />
      )}
      {sheet?.kind === "vision" && (
        <VariableSheetFrame title={t("promptEdit.vision")} onClose={closeSheet}>
          <ImageHelpPanel
            bare
            promptText={value}
            variables={variables}
            sourceFile={visionFile}
            onApplyPrompt={(text, mode) => onChange(mode === "replace" || !value.trim() ? text : `${value}\n\n${text}`)}
            onApplyVariables={handleVisionApply}
          />
        </VariableSheetFrame>
      )}
      {sheet?.kind === "catalog" && (
        <FieldCatalogPicker
          existingFields={variables.map((variable) => ({ label: variable.name.replace(/_/g, " ") }))}
          hideOptionPreview
          onClose={closeSheet}
          onInsert={handleInsertCatalog}
        />
      )}
    </Portal>
  );
}
