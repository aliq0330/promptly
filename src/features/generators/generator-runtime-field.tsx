"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratorField, GeneratorFieldOption, GeneratorValues } from "@/types";

/**
 * A field only gets the fancy visual UI (thumbnail card grid / color
 * swatches) when EVERY one of its options carries the same kind of visual
 * data — a generator authored before this feature existed (CLAUDE.md
 * "Generator Hazır Alanları + Varsayılan Görsel Seçenekleri"), or any field
 * whose options are only partially/never illustrated, falls straight
 * through to the exact same plain text/chip controls this component has
 * always rendered (§13/§14's explicit "never break, always fall back"
 * rule) — no partial/half-illustrated grid is ever shown.
 */
function allOptionsHaveImage(options: GeneratorFieldOption[]): boolean {
  return options.length > 0 && options.every((option) => Boolean(option.image));
}
function allOptionsHaveColor(options: GeneratorFieldOption[]): boolean {
  return options.length > 0 && options.every((option) => Boolean(option.color));
}

/**
 * Renders exactly ONE real generator field, given its current runtime
 * value — the one place every field TYPE's actual input control lives.
 * Used identically by both the builder's own Live Preview (§16) and the
 * real "Generatoru Kullan" runtime (§20) — CLAUDE.md rule §12/§13
 * ("generator creator ile generator user aynı runtime componentleri
 * paylaşmalı") is satisfied by literally sharing this one component, never
 * two parallel implementations.
 */
export function GeneratorRuntimeField({
  field,
  values,
  onChange,
}: {
  field: GeneratorField;
  values: GeneratorValues;
  onChange: (key: string, value: string | string[]) => void;
}) {
  const value = values[field.key];
  const inputId = `gen-field-${field.id}`;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-text">
        {field.label}
        {field.required && <span className="ml-1 text-danger">*</span>}
      </label>
      {field.description && <p className="mb-1.5 text-xs text-text-muted">{field.description}</p>}
      <FieldControl field={field} inputId={inputId} value={value} onChange={(next) => onChange(field.key, next)} />
    </div>
  );
}

function FieldControl({
  field,
  inputId,
  value,
  onChange,
}: {
  field: GeneratorField;
  inputId: string;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const stringValue = Array.isArray(value) ? "" : (value ?? "");
  const arrayValue = Array.isArray(value) ? value : [];

  switch (field.type) {
    case "textarea":
      return (
        <textarea
          id={inputId}
          rows={3}
          value={stringValue}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
      );
    case "select": {
      if (allOptionsHaveImage(field.options)) {
        return <OptionCardGrid options={field.options} selected={stringValue ? [stringValue] : []} onSelect={(value) => onChange(value)} />;
      }
      if (allOptionsHaveColor(field.options)) {
        return <OptionColorSwatches options={field.options} selected={stringValue ? [stringValue] : []} onSelect={(value) => onChange(value)} />;
      }
      return (
        <select
          id={inputId}
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text"
        >
          <option value="">Seç…</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    case "radio": {
      if (allOptionsHaveImage(field.options)) {
        return <OptionCardGrid options={field.options} selected={stringValue ? [stringValue] : []} onSelect={(value) => onChange(value)} />;
      }
      if (allOptionsHaveColor(field.options)) {
        return <OptionColorSwatches options={field.options} selected={stringValue ? [stringValue] : []} onSelect={(value) => onChange(value)} />;
      }
      return (
        <div className="flex flex-wrap gap-2">
          {field.options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                stringValue === option.value ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:text-text",
              )}
            >
              <input
                type="radio"
                name={inputId}
                checked={stringValue === option.value}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }
    case "multi_select": {
      if (allOptionsHaveImage(field.options)) {
        return (
          <OptionCardGrid
            options={field.options}
            selected={arrayValue}
            onSelect={(value) => onChange(arrayValue.includes(value) ? arrayValue.filter((item) => item !== value) : [...arrayValue, value])}
          />
        );
      }
      if (allOptionsHaveColor(field.options)) {
        return (
          <OptionColorSwatches
            options={field.options}
            selected={arrayValue}
            onSelect={(value) => onChange(arrayValue.includes(value) ? arrayValue.filter((item) => item !== value) : [...arrayValue, value])}
          />
        );
      }
      return (
        <div className="flex flex-wrap gap-2">
          {field.options.map((option) => {
            const selected = arrayValue.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  onChange(selected ? arrayValue.filter((item) => item !== option.value) : [...arrayValue, option.value])
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-text-muted hover:text-text",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "number":
      return (
        <input
          id={inputId}
          type="number"
          value={stringValue}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          step={field.step ?? undefined}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
        />
      );
    case "slider": {
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      const step = field.step ?? 1;
      const current = stringValue || String(min);
      return (
        <div className="flex items-center gap-3">
          <input
            id={inputId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={current}
            onChange={(event) => onChange(event.target.value)}
            className="h-2 w-full accent-primary"
          />
          <span className="w-12 shrink-0 text-right text-sm text-text-muted">{current}</span>
        </div>
      );
    }
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="color"
            value={stringValue || "#7c3aed"}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-14 shrink-0 cursor-pointer rounded-md border border-border bg-background"
          />
          <input
            type="text"
            value={stringValue}
            placeholder="#7c3aed"
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
        </div>
      );
    case "checkbox":
      return (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={stringValue === "true"} onChange={(event) => onChange(String(event.target.checked))} />
          {field.placeholder || "Etkinleştir"}
        </label>
      );
    case "toggle":
      return (
        <button
          type="button"
          role="switch"
          aria-checked={stringValue === "true"}
          onClick={() => onChange(String(stringValue !== "true"))}
          className={cn(
            "flex h-6 w-11 items-center rounded-full transition-colors",
            stringValue === "true" ? "bg-primary" : "bg-accent-surface",
          )}
        >
          <span
            className={cn(
              "h-5 w-5 rounded-full bg-surface shadow transition-transform",
              stringValue === "true" ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      );
    case "url":
      return (
        <input
          id={inputId}
          type="url"
          value={stringValue}
          placeholder={field.placeholder || "https://…"}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
        />
      );
    case "text":
    default:
      return (
        <input
          id={inputId}
          type="text"
          value={stringValue}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
        />
      );
  }
}

/**
 * Thumbnail-card option picker (§7/§15) — image on top, name below, the
 * selected option(s) clearly marked. Used for both single-select
 * (select/radio) and multi-select fields; `selected` just carries 0/1/many
 * values, `onSelect` always reports the option that was toggled. Only ever
 * rendered when EVERY option in the field has an `image` (see
 * `allOptionsHaveImage` above) — never a mix of illustrated/plain options.
 * Responsive per §15: 2 cards on mobile, 3–4 on tablet, 4–6 on desktop.
 */
function OptionCardGrid({
  options,
  selected,
  onSelect,
}: {
  options: GeneratorFieldOption[];
  selected: string[];
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            aria-pressed={isSelected}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-md border text-left transition-colors",
              isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/60",
            )}
          >
            <span className="relative block aspect-square w-full overflow-hidden bg-accent-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- option images are data URLs (offline placeholder art or a creator's own upload), never a remote asset next/image would optimize */}
              <img src={option.image} alt="" className="h-full w-full object-cover" />
              {isSelected && (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check size={12} />
                </span>
              )}
            </span>
            <span className={cn("truncate px-2 py-1.5 text-xs font-medium", isSelected ? "text-primary" : "text-text")}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Color-swatch option picker (§6) — a real color dot next to the option's
 * label ("● Siyah", "● Kahverengi", …). Same single/multi-select shape as
 * `OptionCardGrid` above, only ever rendered when EVERY option in the field
 * has a `color`.
 */
function OptionColorSwatches({
  options,
  selected,
  onSelect,
}: {
  options: GeneratorFieldOption[];
  selected: string[];
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            aria-pressed={isSelected}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
              isSelected ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:text-text",
            )}
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border/60" style={{ backgroundColor: option.color }} aria-hidden="true" />
            {option.label}
            {isSelected && <Check size={13} className="shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
