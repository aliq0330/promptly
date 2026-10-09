"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { backwardDeleteRange, forwardDeleteRange, parseDoc, snapSelectionToTokens } from "@/lib/prompt-doc";
import { cn } from "@/lib/utils";

/** Jetonun rengi: değişken (normal prompt), alan (Generator şablonu) ya da tanımsız (yetim). */
export type TokenTone = "variable" | "field" | "unknown";

export interface EditorSelection {
  start: number;
  end: number;
}

export interface PromptDocEditorHandle {
  focus(): void;
  blur(): void;
  getSelection(): EditorSelection;
  setSelection(start: number, end: number): void;
  /** [start,end) aralığını yerel (geri alınabilir) düzenleme hattıyla değiştirir; imleç eklenen metnin arkasında kalır. */
  replaceRange(start: number, end: number, text: string): void;
  /** Aralığın ekran dikdörtgeni (daralmış aralıkta imleç konumu). Düzenleyici gizliyse null. */
  getRangeRect(start: number, end: number): DOMRect | null;
}

const TONE_CLASS: Record<TokenTone, string> = {
  variable:
    "bg-primary-soft text-primary [box-shadow:0_0_0_2px_var(--color-primary-soft)]",
  field:
    "bg-secondary/15 text-secondary [box-shadow:0_0_0_2px_color-mix(in_srgb,var(--color-secondary)_15%,transparent)]",
  unknown:
    "bg-warning/15 text-warning [box-shadow:0_0_0_2px_color-mix(in_srgb,var(--color-warning)_15%,transparent)]",
};

/**
 * Yerel düzenleme hattı: odaklayıp aralığı seçer, sonra `execCommand` ile
 * yazar. Böylece (a) tarayıcının geri al/yinele yığını bozulmaz, (b) `input`
 * olayı React'e normal bir yazma gibi ulaşır. `execCommand` başarısız olursa
 * (eski/özel tarayıcı) `setRangeText` + `input` olayıyla aynı sonuç elde edilir.
 */
function nativeReplace(el: HTMLTextAreaElement, start: number, end: number, text: string) {
  el.focus({ preventScroll: true });
  el.setSelectionRange(start, end);
  let ok = false;
  try {
    ok = text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    el.setRangeText(text, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * Prompt düzenleyici — gerçek bir `<textarea>` (yerel IME, seçim tutamaçları,
 * yapıştırma, geri al, sürükle-bırak, klavye) + arkasında birebir aynı
 * ölçülerle çizilen "ayna" katmanı. Ayna, metindeki `{ad}` jetonlarını
 * pastel etiketlere çevirir; metin textarea'da şeffaftır, yani kullanıcı
 * etiketleri görür ama düzenleme her zaman yerel textarea üzerindedir.
 *
 * Yapı: gerçek değer düz metindir ve `parseDoc` ile sıralı metin/jeton
 * parçalarına ayrılır (`src/lib/prompt-doc.ts`). Jetonlar bölünmezdir:
 *  - seçim/imleç bir jetonun içine düşerse jetonun tamamı seçilir;
 *  - jetonun hemen sağında Backspace (veya solunda Delete) jetonu BÜTÜN siler;
 *  - jeton metni sürüklenip bırakılarak taşınabilir (yerel sürükle-bırak);
 *    listeden sürüklenen `{ad}` metni de bırakıldığı konuma yerleşir.
 */
export const PromptDocEditor = forwardRef<
  PromptDocEditorHandle,
  {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    tokenTone: (name: string) => TokenTone;
    placeholder?: string;
    minRows?: number;
    ariaLabel?: string;
    ariaDescribedBy?: string;
    required?: boolean;
    hidden?: boolean;
    className?: string;
    onSelectionChange?: (selection: EditorSelection) => void;
    onFocusChange?: (focused: boolean) => void;
    /** Ctrl/Cmd + / kısayolu */
    onRequestInsert?: () => void;
  }
>(function PromptDocEditor(
  {
    id,
    value,
    onChange,
    tokenTone,
    placeholder,
    minRows = 4,
    ariaLabel,
    ariaDescribedBy,
    required,
    hidden,
    className,
    onSelectionChange,
    onFocusChange,
    onRequestInsert,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<EditorSelection>({ start: value.length, end: value.length });
  const composingRef = useRef(false);
  const lastWidthRef = useRef(0);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  const segments = useMemo(() => parseDoc(value), [value]);
  const selectionCallbackRef = useRef(onSelectionChange);
  const requestInsertRef = useRef(onRequestInsert);
  useEffect(() => {
    selectionCallbackRef.current = onSelectionChange;
    requestInsertRef.current = onRequestInsert;
  });

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    autosize();
  }, [value, autosize, hidden]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (width !== lastWidthRef.current) {
        lastWidthRef.current = width;
        autosize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [autosize]);

  const syncSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el || composingRef.current) return;
    let start = el.selectionStart;
    let end = el.selectionEnd;
    const snapped = snapSelectionToTokens(el.value, start, end);
    if (snapped.start !== start || snapped.end !== end) {
      el.setSelectionRange(snapped.start, snapped.end);
      start = snapped.start;
      end = snapped.end;
    }
    const previous = selectionRef.current;
    if (previous.start === start && previous.end === end) return;
    selectionRef.current = { start, end };
    selectionCallbackRef.current?.({ start, end });
  }, []);

  // Odaktayken tarayıcı seçimi (klavye, fare, dokunmatik tutamaçlar) değiştirince eşitle.
  useEffect(() => {
    function onSelectionChangeEvent() {
      if (document.activeElement === textareaRef.current) syncSelection();
    }
    document.addEventListener("selectionchange", onSelectionChangeEvent);
    return () => document.removeEventListener("selectionchange", onSelectionChangeEvent);
  }, [syncSelection]);

  // Jetonun yanında Backspace/Delete → jetonun tamamı (yerel yığınla, geri alınabilir).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    function onBeforeInput(event: InputEvent) {
      if (!el || event.isComposing || composingRef.current) return;
      const type = event.inputType;
      const backward = type === "deleteContentBackward" || type === "deleteWordBackward" || type === "deleteSoftLineBackward";
      const forward = type === "deleteContentForward" || type === "deleteWordForward" || type === "deleteSoftLineForward";
      if (!backward && !forward) return;
      if (el.selectionStart !== el.selectionEnd) return;
      const range = backward
        ? backwardDeleteRange(el.value, el.selectionStart, el.selectionEnd)
        : forwardDeleteRange(el.value, el.selectionStart, el.selectionEnd);
      if (!range) return;
      event.preventDefault();
      nativeReplace(el, range.start, range.end, "");
    }
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, []);

  const pointFor = useCallback((offset: number, prefer: "start" | "end"): { node: Node; offset: number } | null => {
    const mirror = mirrorRef.current;
    if (!mirror) return null;
    const spans = Array.from(mirror.querySelectorAll<HTMLElement>("[data-s]"));
    if (spans.length === 0) return { node: mirror, offset: 0 };
    for (let i = 0; i < spans.length; i += 1) {
      const span = spans[i];
      const s = Number(span.dataset.s);
      const e = Number(span.dataset.e);
      if (offset < s || offset > e) continue;
      if (offset === e && prefer === "start" && i < spans.length - 1) continue;
      const textNode = span.firstChild;
      if (!textNode) continue;
      return { node: textNode, offset: Math.min(offset - s, (textNode.textContent ?? "").length) };
    }
    const last = spans[spans.length - 1].firstChild;
    return last ? { node: last, offset: (last.textContent ?? "").length } : null;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        textareaRef.current?.focus({ preventScroll: true });
      },
      blur() {
        textareaRef.current?.blur();
      },
      getSelection() {
        return selectionRef.current;
      },
      setSelection(start, end) {
        const el = textareaRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(start, end);
        selectionRef.current = { start, end };
        selectionCallbackRef.current?.({ start, end });
      },
      replaceRange(start, end, text) {
        const el = textareaRef.current;
        if (!el) return;
        const safeStart = Math.max(0, Math.min(start, el.value.length));
        const safeEnd = Math.max(safeStart, Math.min(end, el.value.length));
        nativeReplace(el, safeStart, safeEnd, text);
        const caret = safeStart + text.length;
        selectionRef.current = { start: caret, end: caret };
        selectionCallbackRef.current?.({ start: caret, end: caret });
      },
      getRangeRect(start, end) {
        const mirror = mirrorRef.current;
        if (!mirror || hidden) return null;
        const a = pointFor(start, "start");
        const b = pointFor(end, "end");
        if (!a || !b) return null;
        const range = document.createRange();
        try {
          range.setStart(a.node, a.offset);
          range.setEnd(b.node, b.offset);
        } catch {
          return null;
        }
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
        if (rects.length > 0) return rects[0];
        if (start === end) {
          // Daralmış aralık bazı satır başlarında boş döner: komşu karakterden türet.
          const text = valueRef.current;
          const probe = document.createRange();
          if (start > 0) {
            const prev = pointFor(start - 1, "start");
            if (prev) {
              try {
                probe.setStart(prev.node, prev.offset);
                probe.setEnd(a.node, a.offset);
                const r = Array.from(probe.getClientRects()).find((rect) => rect.width > 0 || rect.height > 0);
                if (r && text[start - 1] !== "\n") return new DOMRect(r.right, r.top, 0, r.height);
              } catch {
                /* devam */
              }
            }
          }
        }
        const box = mirror.getBoundingClientRect();
        return new DOMRect(box.left + 12, box.top + 8, 0, 24);
      },
    }),
    [hidden, pointFor],
  );

  return (
    <div
      className={cn(
        "relative rounded-lg border border-border bg-background shadow-xs transition-colors duration-200 ease-soft",
        "hover:border-border-strong focus-within:border-primary/60",
        hidden && "hidden",
        className,
      )}
    >
      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 font-mono text-sm leading-6 text-text"
      >
        {segments.map((segment) =>
          segment.type === "token" ? (
            <span
              key={`${segment.start}-t`}
              data-s={segment.start}
              data-e={segment.end}
              data-token={segment.name}
              className={cn("rounded-[5px] box-decoration-clone", TONE_CLASS[tokenTone(segment.name)])}
            >
              {value.slice(segment.start, segment.end)}
            </span>
          ) : (
            <span key={`${segment.start}-x`} data-s={segment.start} data-e={segment.end}>
              {segment.text}
            </span>
          ),
        )}
        {/* Son satır "\n" ile bitiyorsa ayna textarea ile aynı yüksekliği korusun. */}
        <span>{"​"}</span>
      </div>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        rows={minRows}
        required={required}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        spellCheck
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onSelect={syncSelection}
        onKeyUp={syncSelection}
        onPointerUp={syncSelection}
        onClick={syncSelection}
        onFocus={() => {
          onFocusChange?.(true);
          syncSelection();
        }}
        onBlur={() => {
          syncSelection();
          onFocusChange?.(false);
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "/") {
            event.preventDefault();
            requestInsertRef.current?.();
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          syncSelection();
        }}
        className="relative block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent px-3 py-2 font-mono text-sm leading-6 text-transparent caret-text outline-none placeholder:text-text-muted selection:bg-primary/25 selection:text-transparent"
      />
    </div>
  );
});
