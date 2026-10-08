"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  fieldName,
  formatNumber,
  optionLabel,
  optionPhrase,
  type PresetField,
  type PresetValue,
} from "@/lib/preset-fields";
import { cn } from "@/lib/utils";
import { fieldControlClassName } from "@/components/ui/field";

const INPUT = fieldControlClassName;

/**
 * "+ Seçenek oluştur": the first entry of an option list. Opens a one-line
 * input; submitting hands the typed text to `onCreate`, which returns the
 * option value to select (or `undefined` to reject). Not a <form> on purpose —
 * these pickers live inside modals rendered under the page's own form.
 */
function CreateOptionControl({ fieldName: name, onCreate }: { fieldName: string; onCreate: (text: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  function submit() {
    if (!text.trim()) return;
    onCreate(text);
    setText("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("presetField.createOptionAria", { name })}
        data-create-option
        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-border-strong px-3 text-small font-medium text-text-secondary transition-colors hover:border-primary hover:bg-primary-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Plus size={14} aria-hidden />
        {t("presetField.createOption")}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-md border border-border-soft bg-surface-soft p-2" data-create-option-form>
      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          maxLength={120}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setText("");
            }
          }}
          placeholder={t("presetField.createOptionPlaceholder")}
          aria-label={t("presetField.createOptionPlaceholder")}
          className={cn(INPUT, "h-9 min-w-0 flex-1")}
          data-create-option-input
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          data-create-option-submit
          className="shrink-0 rounded-md bg-primary px-3 text-small font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {t("presetField.add")}
        </button>
        <button
          type="button"
          aria-label={t("common.cancel")}
          onClick={() => {
            setOpen(false);
            setText("");
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <p className="text-caption text-text-muted">{t("presetField.createOptionHint")}</p>
    </div>
  );
}

/**
 * The value picker for ONE preset field, shaped by its type: chips for
 * single/multi-select, a native dropdown, text, number, slider, toggle and
 * color. `onChange(undefined)` clears the value. Used wherever a value is
 * chosen — the prompt form's panel, the preset builder (default values) and
 * the field editor.
 */
export function PresetFieldInput({
  field,
  value,
  onChange,
  fragmentLanguage,
  onCreateOption,
}: {
  field: PresetField;
  value: PresetValue | undefined;
  onChange: (next: PresetValue | undefined) => void;
  /** Language for the chip tooltip's prompt phrase (the panel lets the user force English). */
  fragmentLanguage?: "tr" | "en";
  /**
   * Offers "+ Seçenek oluştur" first in an option list. Receives the typed text
   * and returns the option `value` to select (`undefined` = rejected). The
   * option is temporary: the caller decides where it lives.
   */
  onCreateOption?: (text: string) => string | undefined;
}) {
  const { t, language } = useTranslation();
  const phraseLanguage = fragmentLanguage ?? language;
  const label = fieldName(field, language);

  switch (field.type) {
    case "single_select":
    case "multi_select": {
      const multi = field.type === "multi_select";
      const chosen = multi ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
      const create = onCreateOption ? (
        <CreateOptionControl
          fieldName={label}
          onCreate={(text) => {
            const created = onCreateOption(text);
            if (created === undefined) return;
            if (!multi) return onChange(created);
            onChange(chosen.includes(created) ? chosen : [...chosen, created]);
          }}
        />
      ) : null;
      if (field.options.length === 0 && !create) return <p className="text-caption text-text-muted">{t("presetField.noOptions")}</p>;
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
          {create}
          {field.options.map((option) => {
            const selected = chosen.includes(option.value);
            return (
              <Chip
                key={option.id}
                selected={selected}
                title={optionPhrase(field, option, phraseLanguage)}
                data-option={`${field.id}:${option.value}`}
                onClick={() => {
                  if (!multi) return onChange(selected ? undefined : option.value);
                  const next = selected ? chosen.filter((v) => v !== option.value) : [...chosen, option.value];
                  onChange(next.length > 0 ? next : undefined);
                }}
              >
                {optionLabel(option, language)}
              </Chip>
            );
          })}
        </div>
      );
    }
    case "dropdown":
      return (
        <div className="space-y-2">
          {onCreateOption && (
            <CreateOptionControl
              fieldName={label}
              onCreate={(text) => {
                const created = onCreateOption(text);
                if (created !== undefined) onChange(created);
              }}
            />
          )}
          <select
            aria-label={label}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value || undefined)}
            className={cn(INPUT, "h-10")}
            data-field-input={field.id}
          >
            <option value="">{t("presetField.dropdownEmpty")}</option>
            {field.options.map((option) => (
              <option key={option.id} value={option.value}>
                {optionLabel(option, language)}
              </option>
            ))}
          </select>
        </div>
      );
    case "text":
      return (
        <input
          type="text"
          aria-label={label}
          value={typeof value === "string" ? value : ""}
          maxLength={500}
          placeholder={field.config.placeholder ?? t("presetField.textPlaceholder")}
          onChange={(event) => onChange(event.target.value || undefined)}
          className={cn(INPUT, "h-10")}
          data-field-input={field.id}
        />
      );
    case "number":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            aria-label={label}
            value={typeof value === "number" ? value : ""}
            min={field.config.min}
            max={field.config.max}
            step={field.config.step ?? 1}
            onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
            className={cn(INPUT, "h-10 max-w-40")}
            data-field-input={field.id}
          />
          {field.config.unit && <span className="text-small text-text-muted">{field.config.unit}</span>}
        </div>
      );
    case "slider": {
      const min = field.config.min ?? 0;
      const max = field.config.max ?? 100;
      const current = typeof value === "number" ? value : null;
      return (
        <div className="flex items-center gap-3">
          <input
            type="range"
            aria-label={label}
            min={min}
            max={max}
            step={field.config.step ?? 1}
            value={current ?? min}
            onChange={(event) => onChange(Number(event.target.value))}
            className="h-6 min-w-0 flex-1 cursor-pointer"
            data-field-input={field.id}
          />
          <span className="w-14 shrink-0 text-right text-small font-medium tabular-nums text-text">{current === null ? t("presetField.notSet") : formatNumber(field, current)}</span>
          {current !== null && (
            <button type="button" onClick={() => onChange(undefined)} className="shrink-0 text-caption text-text-muted underline hover:text-text">
              {t("presetField.reset")}
            </button>
          )}
        </div>
      );
    }
    case "toggle": {
      const on = value === true;
      return (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={() => onChange(on ? undefined : true)}
          data-field-input={field.id}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            on ? "border-primary bg-primary" : "border-border-strong bg-surface-soft",
          )}
        >
          <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200", on ? "translate-x-6" : "translate-x-1")} />
        </button>
      );
    }
    case "color": {
      const hex = typeof value === "string" ? value : null;
      return (
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label={label}
            value={hex ?? "#7c3aed"}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background p-1"
            data-field-input={field.id}
          />
          <span className="text-small tabular-nums text-text-secondary">{hex ?? t("presetField.notSet")}</span>
          {hex && (
            <button type="button" onClick={() => onChange(undefined)} className="text-caption text-text-muted underline hover:text-text">
              {t("presetField.reset")}
            </button>
          )}
        </div>
      );
    }
  }
}
