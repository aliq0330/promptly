"use client";

import { useId } from "react";
import { PresetFieldInput } from "@/features/presets/preset-field-input";
import { fieldControlClassName } from "@/components/ui/field";
import { findTool } from "@/lib/ai-tool-catalog";
import { fieldName, optionLabel, type PresetField, type PresetSelection, type PresetValue } from "@/lib/preset-fields";
import { fieldToolOnly } from "@/lib/preset-fit";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * A preset's fields in Studio as a two-column grid (docs/history/228-*, the canvas design): each cell has the field's name with an
 * on/off switch (off = the field is not added to the final prompt) and its value — a plain select for single-choice fields, the
 * ordinary field editor for the rest. A field that belongs to one tool (Midjourney's `--ar`) and does not fit the model Studio sends to
 * (`unavailable`) is switched off by itself, dimmed, and says why.
 */
export function StudioPresetFields({
  fields,
  selection,
  onSelectionChange,
  off,
  unavailable,
  onToggle,
}: {
  fields: readonly PresetField[];
  selection: PresetSelection;
  onSelectionChange: (next: PresetSelection) => void;
  off: readonly string[];
  unavailable: readonly string[];
  onToggle: (fieldId: string) => void;
}) {
  const { t, language } = useTranslation();
  const baseId = useId();
  if (fields.length === 0) return null;

  function setValue(fieldId: string, value: PresetValue | undefined) {
    const next = { ...selection };
    if (value === undefined || value === "") delete next[fieldId];
    else next[fieldId] = value;
    onSelectionChange(next);
  }

  return (
    <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2" role="group" aria-label={t("presetFit.fields")}>
      {fields.map((field) => {
        const blocked = unavailable.includes(field.id);
        const on = !blocked && !off.includes(field.id);
        const name = fieldName(field, language);
        const controlId = `${baseId}-${field.id}`;
        const simpleSelect = (field.type === "single_select" || field.type === "dropdown") && field.options.length > 0;
        return (
          <div key={field.id} data-field-row={field.id} className={cn("min-w-0 space-y-1", !simpleSelect && "sm:col-span-2")}>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={simpleSelect ? controlId : undefined} className="min-w-0 truncate text-caption font-semibold text-text-secondary">
                {name}
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t("studio.useField", { name })}
                disabled={blocked}
                onClick={() => onToggle(field.id)}
                className={cn(
                  "relative h-5 w-[2.125rem] shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                  on ? "bg-primary" : "bg-border-strong",
                )}
              >
                <span aria-hidden className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-[left] duration-200", on ? "left-[1.125rem]" : "left-0.5")} />
              </button>
            </div>
            <div className={cn(!on && "opacity-50")}>
              {simpleSelect ? (
                <select
                  id={controlId}
                  value={typeof selection[field.id] === "string" ? (selection[field.id] as string) : ""}
                  disabled={!on}
                  onChange={(event) => setValue(field.id, event.target.value)}
                  className={cn(fieldControlClassName, "h-11")}
                >
                  <option value="">{t("presetField.notSet")}</option>
                  {field.options.map((option) => (
                    <option key={option.id} value={option.value}>
                      {optionLabel(option, language)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={cn(!on && "pointer-events-none")}>
                  <PresetFieldInput field={field} value={selection[field.id]} fragmentLanguage={language} onChange={(value) => setValue(field.id, value)} />
                </div>
              )}
            </div>
            {blocked && (
              <p className="text-caption leading-snug text-warning">
                {t("presetFit.fieldToolOnly", { tool: findTool(fieldToolOnly(field.id) ?? "")?.name ?? fieldToolOnly(field.id) ?? "" })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
