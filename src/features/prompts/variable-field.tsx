"use client";

import { Chip, ChipRow } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  clampToRange,
  isToggleOn,
  numericRange,
  parseMultiValue,
  toggleMultiValue,
  toggleValue,
} from "@/lib/prompt-variable-types";
import type { PromptVariableSpec } from "@/types";

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-body text-text placeholder:text-text-muted focus:border-primary/60 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong";

/** Selects with this many options or fewer are shown as chips, more as a dropdown. */
const CHIP_LIMIT = 6;

export interface VariableFieldModel extends PromptVariableSpec {
  /** Stable key — also the DOM id suffix. */
  id: string;
  name: string;
  description?: string | null;
  defaultValue: string;
}

/**
 * One typed variable's input, label included (CLAUDE.md §9.145). The parent
 * owns the value — always the plain string that is written into the prompt —
 * so every kind plugs into the same `{name}` substitution. Shared by the
 * detail page's inline fields and the editor's preview tab.
 */
export function VariableField({
  variable,
  value,
  onChange,
}: {
  variable: VariableFieldModel;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const labelId = `pv-label-${variable.id}`;
  const controlId = `pv-${variable.id}`;
  const wide = variable.type === "multi_select" || variable.type === "slider" || (variable.type === "select" && variable.options.length <= CHIP_LIMIT);

  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <label id={labelId} htmlFor={controlId} className="mb-1 block text-caption font-medium text-text-secondary">
        <span className="break-words">{variable.name}</span>
        {variable.description && <span className="ml-1.5 font-normal text-text-muted">— {variable.description}</span>}
      </label>
      <Control id={controlId} labelId={labelId} variable={variable} value={value} onChange={onChange} placeholder={variable.defaultValue || t("prompt.enterValue")} />
    </div>
  );
}

function Control({
  id,
  labelId,
  variable,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  labelId: string;
  variable: VariableFieldModel;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();

  if (variable.type === "select") {
    if (variable.options.length > CHIP_LIMIT) {
      return (
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS}>
          {!variable.options.some((option) => option.value === value) && <option value="">—</option>}
          {variable.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <div id={id} role="radiogroup" aria-labelledby={labelId}>
        <ChipRow>
          {variable.options.map((option) => (
            <Chip
              key={option.value}
              role="radio"
              aria-checked={value === option.value}
              aria-pressed={undefined}
              selected={value === option.value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </ChipRow>
      </div>
    );
  }

  if (variable.type === "multi_select") {
    const selected = new Set(parseMultiValue(value));
    return (
      <div id={id} role="group" aria-labelledby={labelId}>
        <ChipRow>
          {variable.options.map((option) => (
            <Chip
              key={option.value}
              selected={selected.has(option.value)}
              onClick={() => onChange(toggleMultiValue(value, option.value, variable.options))}
            >
              {option.label}
            </Chip>
          ))}
        </ChipRow>
      </div>
    );
  }

  if (variable.type === "number") {
    const { min, max, step } = numericRange(variable.config);
    return (
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const parsed = Number(value);
          onChange(value.trim() !== "" && Number.isFinite(parsed) ? String(clampToRange(parsed, variable.config)) : String(min));
        }}
        className={INPUT_CLASS}
      />
    );
  }

  if (variable.type === "slider") {
    const { min, max, step } = numericRange(variable.config);
    const parsed = Number(value);
    const current = value.trim() !== "" && Number.isFinite(parsed) ? parsed : min;
    return (
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 min-w-0 flex-1"
        />
        <output htmlFor={id} className="w-14 shrink-0 text-right font-mono text-sm tabular-nums text-text">
          {current}
        </output>
      </div>
    );
  }

  if (variable.type === "toggle") {
    const on = isToggleOn(value, variable.config);
    return (
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        onClick={() => onChange(toggleValue(!on, variable.config))}
        className="flex min-h-10 w-full items-center gap-3 rounded-lg border border-border bg-background px-3 text-left shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span
          aria-hidden
          className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", on ? "bg-primary" : "bg-border-strong")}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-xs transition-[left] duration-200",
              on ? "left-[18px]" : "left-0.5",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 break-words text-body text-text">
          {on ? variable.config.onText : variable.config.offText || t("variable.toggleOffEmpty")}
        </span>
      </button>
    );
  }

  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={INPUT_CLASS}
    />
  );
}
