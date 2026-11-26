"use client";

import { useEffect, useRef } from "react";
import { VariableField } from "@/features/prompts/variable-field";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptFill } from "./focus-fill";

/**
 * Filling a text prompt right on its scene (docs/history/436-*): a tap on a `{variable}` chip turns the prompt strip's place into this picker — the
 * variable's own control (choice chips, a text field, a number, a slider, a toggle: `VariableField`) — while the words above update live.
 * "Tamam" closes it; when more fields are left the next one is one tap away. Phone only: from `md` the chip focuses the field in the side panel.
 */
export function FocusFillPicker({ fill, name, onClose, onPick }: { fill: PromptFill; name: string; onClose: () => void; onPick: (name: string) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const shown = fill.variables.filter((variable) => fill.visible[variable.name] !== false);
  const index = shown.findIndex((variable) => variable.name === name);
  const variable = shown[index];
  const next = index >= 0 ? shown[index + 1] : undefined;

  // Focus moves into the picker; Esc closes it.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [name]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!variable) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={t("focusFeed.fillTitle", { name })}
      tabIndex={-1}
      data-focus-picker=""
      className="absolute inset-x-0 bottom-0 z-40 rounded-t-xl border-t border-border-soft bg-surface px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2 text-text shadow-pop outline-none animate-sheet-up motion-reduce:animate-none md:hidden"
    >
      <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border-strong" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-semibold text-text-secondary">{t("focusFeed.fillVariable")}</p>
          <p className="prompt-text truncate text-body text-secondary">{`{${variable.name}}`}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-focus-picker-done=""
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-sm bg-primary px-5 text-label font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {t("focusFeed.fillDone")}
        </button>
      </div>
      <div className="mt-3 max-h-[40dvh] overflow-y-auto overscroll-contain">
        <VariableField key={variable.id} variable={variable} value={fill.values[variable.name] ?? ""} onChange={(value) => fill.setValue(variable.name, value)} />
      </div>
      {next && (
        <button
          type="button"
          onClick={() => onPick(next.name)}
          className="mt-3 inline-flex min-h-11 items-center text-caption font-semibold text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {t("focusFeed.fillNext", { name: next.name })}
        </button>
      )}
    </div>
  );
}
