"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Braces, Library, PanelRight, Pencil, Plus, Replace, TextCursorInput, Trash2, X } from "lucide-react";
import { moveTokenByWord, tokenRanges } from "@/lib/prompt-doc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { AnchoredPopover } from "./anchored-popover";
import { InsertPicker, type PickerFilter, type PickerItem } from "./insert-picker";
import { resolveInsertSurface, type InsertSurface } from "./insert-surface";
import { PromptDocEditor, type EditorSelection, type PromptDocEditorHandle, type TokenTone } from "./prompt-doc-editor";
import { SelectionToolbar, type ToolbarAction } from "./selection-toolbar";

export interface ComposerHandle {
  focus(): void;
  /** `{name}` jetonunu verilen aralığa (yoksa son kaydedilen seçime) ekler. */
  insertToken(name: string, range?: EditorSelection): void;
  /** Ekleme yüzeyi / oluşturma akışı açıldığı andaki seçim. */
  getPendingRange(): EditorSelection | null;
  getSelection(): EditorSelection;
}

/**
 * Normal prompt değişkenleri (`mode="variable"`) ve Generator şablon alanları
 * (`mode="field"`) için ORTAK düzenleme + yerleştirme altyapısı. İkisi aynı
 * düzenleyiciyi, aynı yüzeyleri ve aynı ekleme fonksiyonunu kullanır; neyin
 * eklendiğini (öğe listesi) ve yeni öğenin nasıl oluşturulduğunu üst bileşen
 * verir — iki sistemin veri modeli ve doğrulaması ayrı kalır.
 *
 * Yüzeyler: mobil/dikey tablet → Bottom Sheet; yatay dokunmatik tablet → sağ
 * panel; masaüstü → imleç yanı popover (+ "Tüm …" ile sağ panel).
 */
export const PromptComposer = forwardRef<
  ComposerHandle,
  {
    mode: "variable" | "field";
    id?: string;
    value: string;
    onChange: (value: string) => void;
    items: PickerItem[];
    filters: PickerFilter[];
    tokenTone: (name: string) => TokenTone;
    placeholder?: string;
    minRows?: number;
    ariaLabel?: string;
    required?: boolean;
    /** Yeni değişken/alan oluşturma akışını üst bileşen açar. */
    onCreateNew: (context: { range: EditorSelection; selectedText: string }) => void;
    /** Yalnızca `variable` modunda: seçili metni değişkene dönüştürme akışı. */
    onConvertSelection?: (context: { range: EditorSelection; selectedText: string }) => void;
    /** Yalnızca `field` modunda: hazır alan kütüphanesini aç. */
    onOpenCatalog?: () => void;
    /** Sağ panelde listenin altında gösterilecek ek içerik (ör. değişken yönetimi). */
    panelExtra?: React.ReactNode;
    /** Eylem satırının solu (ör. Şablon/Önizleme sekmeleri). */
    leading?: React.ReactNode;
    /** Düzenleyiciyi gizle (durumu korunur) — ör. Önizleme sekmesi. */
    hideEditor?: boolean;
    className?: string;
  }
>(function PromptComposer(
  {
    mode,
    id,
    value,
    onChange,
    items,
    filters,
    tokenTone,
    placeholder,
    minRows,
    ariaLabel,
    required,
    onCreateNew,
    onConvertSelection,
    onOpenCatalog,
    panelExtra,
    leading,
    hideEditor,
    className,
  },
  ref,
) {
  const { t } = useTranslation();
  const editorRef = useRef<PromptDocEditorHandle>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [selection, setSelection] = useState<EditorSelection>({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [picker, setPicker] = useState<{ surface: InsertSurface; range: EditorSelection } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const pendingRangeRef = useRef<EditorSelection | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const isVariable = mode === "variable";
  const hasSelection = selection.end > selection.start;
  const selectedText = hasSelection ? value.slice(selection.start, selection.end) : "";

  const insertToken = useCallback(
    (name: string, range?: EditorSelection) => {
      const editor = editorRef.current;
      if (!editor) return;
      const target = range ?? pendingRangeRef.current ?? editor.getSelection();
      // Daralmış imleçte jeton kelimeye yapışmasın: komşu harf/rakam/jeton varsa boşluk bırak.
      let text = `{${name}}`;
      if (target.start === target.end) {
        const before = value[target.start - 1];
        const after = value[target.end];
        if (before !== undefined && (/[\p{L}\p{N}]/u.test(before) || before === "}")) text = ` ${text}`;
        if (after !== undefined && (/[\p{L}\p{N}]/u.test(after) || after === "{")) text = `${text} `;
      }
      editor.replaceRange(target.start, target.end, text);
      pendingRangeRef.current = null;
    },
    [value],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editorRef.current?.focus(),
      insertToken,
      getPendingRange: () => pendingRangeRef.current,
      getSelection: () => editorRef.current?.getSelection() ?? { start: 0, end: 0 },
    }),
    [insertToken],
  );

  function openPicker(options: { replace?: boolean } = {}) {
    const editor = editorRef.current;
    if (!editor || hideEditor) return;
    const current = editor.getSelection();
    // Seçili metni yanlışlıkla silmemek için varsayılan: seçimin SONUNA ekle.
    const range = options.replace ? current : { start: current.end, end: current.end };
    pendingRangeRef.current = range;
    const surface = resolveInsertSurface();
    if (surface === "sheet") editor.blur(); // klavyeyi kapat: sayfa klavyenin altında kalmasın
    setPicker({ surface, range });
  }

  function closePicker() {
    setPicker(null);
  }

  function pick(item: PickerItem) {
    if (!picker) return;
    const range = picker.range;
    closePicker();
    insertToken(item.name, range);
  }

  function create() {
    if (!picker) return;
    const range = picker.range;
    const text = value.slice(range.start, range.end);
    closePicker();
    pendingRangeRef.current = range;
    onCreateNew({ range, selectedText: text });
  }

  const getPopoverAnchor = useCallback((): DOMRect | null => {
    const range = picker?.range ?? selection;
    return editorRef.current?.getRangeRect(range.start, range.end) ?? triggerRef.current?.getBoundingClientRect() ?? null;
  }, [picker, selection]);

  // Seçim tam olarak tek bir jetonsa: dokunmatikte sürükleme olmadan yeniden sıralama + kaldırma.
  const selectedToken = hasSelection
    ? (tokenRanges(value).find((range) => range.start === selection.start && range.end === selection.end) ?? null)
    : null;

  function moveSelectedToken(direction: "left" | "right") {
    if (!selectedToken) return;
    const moved = moveTokenByWord(value, selectedToken, direction);
    const editor = editorRef.current;
    if (!moved || !editor) return;
    // Yalnızca değişen aralığı yerel hatla değiştir → geri al tek adımda çalışır.
    let prefix = 0;
    const max = Math.min(value.length, moved.text.length);
    while (prefix < max && value[prefix] === moved.text[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < max - prefix &&
      value[value.length - 1 - suffix] === moved.text[moved.text.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    editor.replaceRange(prefix, value.length - suffix, moved.text.slice(prefix, moved.text.length - suffix));
    editor.setSelection(moved.token.start, moved.token.end);
  }

  const toolbarVisible = !hideEditor && hasSelection && (focused || editing);
  const tokenActions: ToolbarAction[] = [
    {
      id: "move-left",
      label: t("composer.moveLeft"),
      icon: ArrowLeft,
      primary: true,
      onClick: () => moveSelectedToken("left"),
    },
    {
      id: "move-right",
      label: t("composer.moveRight"),
      icon: ArrowRight,
      onClick: () => moveSelectedToken("right"),
    },
    {
      id: "remove-token",
      label: t("composer.removeToken"),
      icon: Trash2,
      onClick: () => {
        if (selectedToken) editorRef.current?.replaceRange(selectedToken.start, selectedToken.end, "");
      },
    },
    {
      id: "cancel",
      label: t("common.cancelAction"),
      icon: X,
      onClick: () => editorRef.current?.setSelection(selection.end, selection.end),
    },
  ];
  const toolbarActions: ToolbarAction[] = selectedToken ? tokenActions : [
    isVariable && onConvertSelection
      ? {
          id: "convert",
          label: t("composer.convertToVariable"),
          icon: Braces,
          primary: true,
          onClick: () => {
            const range = { ...selection };
            pendingRangeRef.current = range;
            onConvertSelection({ range, selectedText });
          },
        }
      : {
          id: "replace",
          label: t("composer.replaceWithField"),
          icon: Replace,
          primary: true,
          onClick: () => openPicker({ replace: true }),
        },
    {
      id: "edit",
      label: t("composer.editText"),
      icon: Pencil,
      onClick: () => {
        setEditValue(selectedText);
        setEditing(true);
      },
    },
    {
      id: "cancel",
      label: t("common.cancelAction"),
      icon: X,
      onClick: () => editorRef.current?.setSelection(selection.end, selection.end),
    },
  ];

  function applyEdit() {
    const range = { ...selection };
    setEditing(false);
    editorRef.current?.replaceRange(range.start, range.end, editValue);
  }

  function cancelEdit() {
    setEditing(false);
    editorRef.current?.setSelection(selection.start, selection.end);
  }

  const toolbar = toolbarVisible && (
    <SelectionToolbar
      mode={coarse ? "docked" : "floating"}
      anchor={() => editorRef.current?.getRangeRect(selection.start, selection.end) ?? null}
      anchorKey={`${selection.start}-${selection.end}`}
      actions={toolbarActions}
      editing={editing}
      editValue={editValue}
      onEditValueChange={setEditValue}
      onEditApply={applyEdit}
      onEditCancel={cancelEdit}
      label={t("composer.selectionToolbarAria")}
    />
  );

  const triggerLabel = isVariable ? t("composer.addVariable") : t("composer.addField");
  const title = isVariable ? t("composer.addVariableTitle") : t("composer.addFieldTitle");

  const pickerContent = (surface: InsertSurface) => (
    <InsertPicker
      title={title}
      items={items}
      filters={filters}
      tone={isVariable ? "variable" : "field"}
      searchPlaceholder={isVariable ? t("composer.searchVariables") : t("composer.searchFields")}
      emptyText={isVariable ? t("composer.noVariablesYet") : t("composer.noFieldsYet")}
      createLabel={isVariable ? t("composer.createVariable") : t("composer.createField")}
      onPick={pick}
      onCreate={create}
      onClose={closePicker}
      draggable={surface !== "sheet"}
      autoFocusSearch={surface !== "sheet"}
      footer={
        <>
          {!isVariable && onOpenCatalog && (
            <button
              type="button"
              onClick={() => {
                closePicker();
                onOpenCatalog();
              }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
            >
              <Library size={16} /> {t("composer.fromCatalog")}
            </button>
          )}
          {surface === "popover" && (
            <button
              type="button"
              onClick={() => setPicker((prev) => (prev ? { ...prev, surface: "panel" } : prev))}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
            >
              <PanelRight size={16} /> {isVariable ? t("composer.allVariables") : t("composer.allFields")}
            </button>
          )}
        </>
      }
    />
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">{leading}</div>
        <Button
          ref={triggerRef}
          type="button"
          size="sm"
          variant="outline"
          data-insert-trigger
          data-testid="composer-add"
          disabled={hideEditor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (picker ? closePicker() : openPicker())}
          aria-haspopup="dialog"
          aria-expanded={Boolean(picker)}
          title={t("composer.shortcutHint")}
        >
          <Plus size={14} /> {triggerLabel}
        </Button>
      </div>

      <PromptDocEditor
        ref={editorRef}
        id={id}
        value={value}
        onChange={onChange}
        tokenTone={tokenTone}
        placeholder={placeholder}
        minRows={minRows}
        ariaLabel={ariaLabel}
        required={required}
        hidden={hideEditor}
        onSelectionChange={setSelection}
        onFocusChange={setFocused}
        onRequestInsert={() => openPicker()}
      />

      {toolbar}

      {coarse && !hideEditor && !hasSelection && (
        <p className="flex items-center gap-1.5 text-caption text-text-muted">
          <TextCursorInput size={12} aria-hidden /> {isVariable ? t("composer.hintTouchVariable") : t("composer.hintTouchField")}
        </p>
      )}

      {picker?.surface === "sheet" && (
        <Modal variant="sheet" onClose={closePicker} labelledBy="insert-picker-title">
          <div className="flex h-[min(34rem,78dvh)] w-full max-w-lg flex-col rounded-t-2xl border border-b-0 border-border bg-surface-elevated pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-pop">
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden />
            {pickerContent("sheet")}
          </div>
        </Modal>
      )}
      {picker?.surface === "panel" && (
        <Modal variant="side" onClose={closePicker} labelledBy="insert-picker-title">
          <div className="flex h-full w-[400px] max-w-[92vw] flex-col border-l border-border bg-surface-elevated shadow-pop">
            {pickerContent("panel")}
            {panelExtra && <div className="max-h-[45%] overflow-y-auto border-t border-border-soft p-3">{panelExtra}</div>}
          </div>
        </Modal>
      )}
      {picker?.surface === "popover" && (
        <AnchoredPopover anchor={getPopoverAnchor} onClose={closePicker} label={title}>
          {pickerContent("popover")}
        </AnchoredPopover>
      )}
    </div>
  );
});
