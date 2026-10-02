"use client";

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

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

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
}: {
  field: PresetField;
  value: PresetValue | undefined;
  onChange: (next: PresetValue | undefined) => void;
  /** Language for the chip tooltip's prompt phrase (the panel lets the user force English). */
  fragmentLanguage?: "tr" | "en";
}) {
  const { t, language } = useTranslation();
  const phraseLanguage = fragmentLanguage ?? language;
  const label = fieldName(field, language);

  switch (field.type) {
    case "single_select":
    case "multi_select": {
      if (field.options.length === 0) return <p className="text-caption text-text-muted">{t("presetField.noOptions")}</p>;
      const multi = field.type === "multi_select";
      const chosen = multi ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
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
