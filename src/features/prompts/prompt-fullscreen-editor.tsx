"use client";

import { useEffect, useRef, useState } from "react";
import { Braces, Check, Pencil, Redo2, SlidersHorizontal, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Portal } from "@/components/ui/portal";
import { PromptDocEditor, type EditorSelection, type PromptDocEditorHandle, type TokenTone } from "@/features/content/prompt-composer/prompt-doc-editor";
import { useTranslation } from "@/lib/i18n/language-provider";
import { extractVariableTokenNames, isValidVariableName } from "@/lib/prompt-variables";
import { findConvertTarget, suggestVariableName } from "@/lib/prompt-word-target";
import { emptySpec } from "@/lib/prompt-variable-types";
import { cn } from "@/lib/utils";
import { makeTempId, type DraftVariable } from "./draft-variable";

/** Son dönüştürmeyi geri almak için gereken her şey; metin değişince (kullanıcı yazınca) geçersiz olur. */
interface ConvertRecord {
  name: string;
  token: string;
  start: number;
  original: string;
  /** Bu dönüştürmenin açtığı yeni değişken (mevcut bir değişkene bağlandıysa null). */
  createdTempId: string | null;
  /** Dönüştürmeden hemen sonraki metin: farklıysa geri al artık güvenli değildir. */
  afterValue: string;
}

const UNDO_VISIBLE_MS = 4500;

interface VisibleBox {
  top: number;
  height: number;
}

/**
 * Ekranda GÖRÜNEN alan (`visualViewport`): iOS'ta klavye açılınca düzen görünümü küçülmez, görünür alan küçülür ve kayar. Klavye
 * animasyonu sırasında değerler değişir ve son olay kaçabilir (katman ara bir ölçümde takılıp kısa kalır, arkadaki form görünür);
 * bu yüzden olaylara ek olarak odak/yeniden boyutlanma sonrası kısa süre kare kare ölçülür. Her zaman bir ölçü döner (klavye
 * kapalıyken tüm ekran), `null` yalnız ilk ölçümden önce / `visualViewport` olmayan tarayıcıda.
 */
function useVisibleBox(): VisibleBox | null {
  const [box, setBox] = useState<VisibleBox | null>(null);
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    let frame = 0;
    let until = 0;
    function tick() {
      frame = 0;
      const next = { top: Math.round(visual!.offsetTop), height: Math.round(visual!.height) };
      setBox((prev) => (prev && prev.top === next.top && prev.height === next.height ? prev : next));
      if (performance.now() < until) frame = requestAnimationFrame(tick);
    }
    function settle() {
      until = performance.now() + 900;
      if (!frame) frame = requestAnimationFrame(tick);
    }
    settle();
    visual.addEventListener("resize", settle);
    visual.addEventListener("scroll", settle);
    window.addEventListener("resize", settle);
    document.addEventListener("focusin", settle);
    document.addEventListener("focusout", settle);
    return () => {
      visual.removeEventListener("resize", settle);
      visual.removeEventListener("scroll", settle);
      window.removeEventListener("resize", settle);
      document.removeEventListener("focusin", settle);
      document.removeEventListener("focusout", settle);
      cancelAnimationFrame(frame);
    };
  }, []);
  return box;
}

/**
 * Prompt metni için TAM EKRAN yazma katmanı (docs/history/288-*). Formdaki düzenleyicinin yerine geçmez; aynı `value`/`variables`
 * üzerinde ikinci bir görünümdür ve kapanınca form olduğu gibi kalır.
 *
 * Üstte iki katman sabit durur (metin kayarken ya da klavye açılırken yerinden oynamaz):
 *  1. başlık satırı: Kapat · Prompt metni (+ değişken/karakter sayısı) · Geri al/Yinele · Bitti;
 *  2. sol üstte TEK dönüştürme düğmesi, sağında "Hazır ayarlar". Düğmenin boyu hiç değişmez (yalnız içeriği): imleç bir kelimedeyse
 *     kelimenin tamamı, bir metin seçiliyse seçilen metin tek dokunuşla değişkene döner (`findConvertTarget`); imleç hazır bir
 *     `{değişken}`in yanındaysa "Değişkeni düzenle" olur; boşlukta pasif kalır.
 *
 * Dönüştürme hemen yapılır: ad kelimeden üretilir (`suggestVariableName`), varsayılan değer kelimenin kendisidir. Aynı ad
 * (büyük/küçük harf duyarsız) varsa yeni değişken açılmaz, mevcut olana bağlanır. 4,5 sn "Geri al" görünür.
 * Düzenleme/ayrıntı için mevcut değişken penceresi açılır (`onEditVariable`); ikinci bir pencere yazılmaz.
 *
 * `z-49`: `Modal`lar (z-50) bu katmanın ÜSTÜNE açılır (değişken penceresi, Hazır ayarlar paneli) ve Escape önce onları kapatır.
 */
export function PromptFullscreenEditor({
  value,
  onChange,
  variables,
  onVariablesChange,
  tokenTone,
  placeholder,
  onEditVariable,
  onOpenPresets,
  presetCount = 0,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  variables: DraftVariable[];
  onVariablesChange: (variables: DraftVariable[]) => void;
  tokenTone: (name: string) => TokenTone;
  placeholder?: string;
  /** Jetonun değişkenini düzenleme penceresini aç (tanımsız jeton için üst bileşen önce tanımlar). */
  onEditVariable: (name: string) => void;
  /** Verilirse üstte "Hazır ayarlar" görünür (form paneli açar). */
  onOpenPresets?: () => void;
  /** Uygulanan hazır ayar/alan sayısı (rozet). */
  presetCount?: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const editorRef = useRef<PromptDocEditorHandle>(null);
  const box = useVisibleBox();
  const [selection, setSelection] = useState<EditorSelection>({ start: value.length, end: value.length });
  const [done, setDone] = useState<ConvertRecord | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    lockBodyScroll();
    editorRef.current?.setSelection(value.length, value.length);
    return () => unlockBodyScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız açılışta: imleç metnin sonunda, odak düzenleyicide
  }, []);

  // Escape: üstte açık bir pencere (değişken/Hazır ayarlar) varsa onu kapatan Modal alır; yoksa katman kapanır.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-prompt-fullscreen])')) return;
      closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // "Geri al" yalnız kısa süre görünür.
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(null), UNDO_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  const doneActive = done !== null && done.afterValue === value;
  const target = findConvertTarget(value, selection.start, selection.end);
  const definedNames = new Set(variables.map((variable) => variable.name));
  const tokenIsDefined = target.kind === "token" && definedNames.has(target.name);
  const variableCount = extractVariableTokenNames(value).length;

  function convert() {
    if (target.kind !== "word" && target.kind !== "selection") return;
    const editor = editorRef.current;
    const name = suggestVariableName(target.text);
    if (!editor || !name || !isValidVariableName(name)) return;
    const existing = variables.find((variable) => variable.name.toLowerCase() === name.toLowerCase());
    const finalName = existing?.name ?? name;
    const token = `{${finalName}}`;
    const createdTempId = existing ? null : makeTempId();
    if (createdTempId) {
      onVariablesChange([
        ...variables,
        { ...emptySpec("text"), tempId: createdTempId, name: finalName, defaultValue: target.text, description: "" },
      ]);
    }
    editor.replaceRange(target.start, target.end, token);
    setDone({
      name: finalName,
      token,
      start: target.start,
      original: target.text,
      createdTempId,
      afterValue: value.slice(0, target.start) + token + value.slice(target.end),
    });
  }

  function undoConvert() {
    const editor = editorRef.current;
    if (!done || !doneActive || !editor) return;
    editor.replaceRange(done.start, done.start + done.token.length, done.original);
    if (done.createdTempId) onVariablesChange(variables.filter((variable) => variable.tempId !== done.createdTempId));
    editor.setSelection(done.start, done.start + done.original.length);
    setDone(null);
  }

  function onConvertClick() {
    if (target.kind === "token") onEditVariable(target.name);
    else convert();
  }

  /** Yerel geri al/yinele (yazma + dönüştürme aynı yığında). Odak/seçim düğmeye geçmesin diye mousedown engellenir. */
  function history(kind: "undo" | "redo") {
    editorRef.current?.focus();
    try {
      document.execCommand(kind);
    } catch {
      /* eski tarayıcı: sessizce geç */
    }
  }

  const keep = (event: React.MouseEvent) => event.preventDefault();

  let kindLine = t("composer.convertToVariable");
  let valueLine = "";
  let Icon = Braces;
  let tone: "active" | "token" | "idle" | "done" = "idle";
  if (doneActive && done) {
    tone = "done";
    Icon = Check;
    kindLine = done.createdTempId ? t("fullscreen.created") : t("fullscreen.linked");
    valueLine = `{${done.name}}`;
  } else if (target.kind === "word" || target.kind === "selection") {
    tone = "active";
    valueLine = `“${target.text}”`;
  } else if (target.kind === "token") {
    tone = "token";
    Icon = Pencil;
    kindLine = tokenIsDefined ? t("fullscreen.editVariable") : t("fullscreen.defineVariable");
    valueLine = `{${target.name}}`;
  } else {
    valueLine = target.kind === "blocked" ? t("fullscreen.blocked") : t("fullscreen.pickWord");
  }
  const disabled = tone === "idle";

  return (
    <Portal>
      {/* Dış katman HER ZAMAN tüm ekranı kaplar (düz zemin): ölçüm geç/yanlış gelse bile arkadaki form görünmez. */}
      <div
        data-prompt-fullscreen
        data-testid="prompt-fullscreen"
        role="dialog"
        aria-label={t("prompt.promptTextHeading")}
        className="fixed inset-0 z-[49] overflow-hidden overscroll-none bg-background animate-fade-in"
      >
        {/* İç alan görünür alana (klavyenin üstüne) oturur: başlık, sabit satır ve metin hep görünür. */}
        <div
          data-testid="fullscreen-visible"
          style={box ? { top: box.top, height: box.height } : { top: 0, bottom: 0 }}
          className="absolute inset-x-0 flex flex-col"
        >
          <header className="flex shrink-0 items-center gap-1 border-b border-border-soft bg-surface px-2 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={onClose}
              aria-label={t("fullscreen.close")}
              data-testid="fullscreen-close"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
            >
              <X size={20} aria-hidden />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-body font-semibold leading-tight text-text">{t("prompt.promptTextHeading")}</h2>
              <p className="truncate text-caption text-text-muted" data-testid="fullscreen-meta">
                {t("fullscreen.meta", { count: variableCount, chars: value.length })}
              </p>
            </div>
            <button
              type="button"
              onMouseDown={keep}
              onClick={() => history("undo")}
              aria-label={t("fullscreen.undo")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
            >
              <Undo2 size={18} aria-hidden />
            </button>
            <button
              type="button"
              onMouseDown={keep}
              onClick={() => history("redo")}
              aria-label={t("fullscreen.redo")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
            >
              <Redo2 size={18} aria-hidden />
            </button>
            <Button type="button" size="sm" onClick={onClose} data-testid="fullscreen-done">
              {t("fullscreen.done")}
            </Button>
          </header>

          {/* SABİT satır: sol üstte dönüştürme, sağda Hazır ayarlar. Yüksekliği sabit: içerik değişse de ekran zıplamaz. */}
          <div className="flex min-h-[62px] shrink-0 items-center gap-2 border-b border-border-soft bg-surface px-3 py-2">
            <button
              type="button"
              onMouseDown={keep}
              onClick={onConvertClick}
              aria-disabled={disabled}
              data-testid="fullscreen-convert"
              data-mode={tone === "idle" ? target.kind : tone}
              className={cn(
                "inline-flex h-11 min-w-0 max-w-[62%] items-center gap-2.5 rounded-full border px-3.5 text-left transition-colors",
                tone === "active" && "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
                tone === "token" && "border-primary bg-surface text-primary hover:bg-primary-soft",
                tone === "done" && "border-success bg-success/10 text-success",
                tone === "idle" && "cursor-default border-border bg-surface-soft text-text-muted",
              )}
            >
              <Icon size={18} className="shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="whitespace-nowrap text-[11px] font-semibold opacity-90">{kindLine}</span>
                <span className={cn("truncate text-label font-semibold", tone !== "idle" && "font-mono")} data-testid="fullscreen-convert-text">
                  {valueLine}
                </span>
              </span>
            </button>

            <div className="ml-auto flex shrink-0 items-center">
              {doneActive ? (
                <Button type="button" size="sm" variant="outline" onMouseDown={keep} onClick={undoConvert} data-testid="fullscreen-undo-convert">
                  <Undo2 size={14} aria-hidden /> {t("fullscreen.undo")}
                </Button>
              ) : (
                onOpenPresets && (
                  <Button type="button" size="sm" variant="outline" onClick={onOpenPresets} aria-haspopup="dialog" data-testid="fullscreen-presets">
                    <SlidersHorizontal size={14} aria-hidden /> {t("fullscreen.presets")}
                    {presetCount > 0 && (
                      <span className="rounded-full bg-primary px-1.5 text-caption font-semibold tabular-nums text-primary-foreground">{presetCount}</span>
                    )}
                  </Button>
                )
              )}
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-16"
            onClick={(event) => {
              // Metnin altındaki boş alana dokunmak da yazmaya devam ettirir.
              if (event.target === event.currentTarget) editorRef.current?.focus();
            }}
          >
            <PromptDocEditor
              ref={editorRef}
              fill
              value={value}
              onChange={onChange}
              tokenTone={tokenTone}
              placeholder={placeholder}
              minRows={14}
              ariaLabel={t("prompt.promptTextHeading")}
              onSelectionChange={setSelection}
            />
          </div>
        </div>
      </div>
    </Portal>
  );
}
