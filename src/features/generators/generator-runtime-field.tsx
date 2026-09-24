"use client";

import { cn } from "@/lib/utils";
import type { GeneratorField, GeneratorValues } from "@/types";

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
    case "select":
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
    case "radio":
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
    case "multi_select":
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
