"use client";

import { Check } from "lucide-react";
import { Chip, ChipRow } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  allOptionsHaveColor,
  allOptionsHaveImage,
  clampToRange,
  isToggleOn,
  numericRange,
  parseMultiValue,
  toggleMultiValue,
  toggleValue,
} from "@/lib/prompt-variable-types";
import type { PromptVariableOption, PromptVariableSpec } from "@/types";

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
  hideLabel = false,
}: {
  variable: VariableFieldModel;
  value: string;
  onChange: (value: string) => void;
  /** Kartın kendi başlığı varsa (stüdyo düzeninin "Değerler" kartı) etiket yalnız ekran okuyucuya kalır. */
  hideLabel?: boolean;
}) {
  const { t } = useTranslation();
  const labelId = `pv-label-${variable.id}`;
  const controlId = `pv-${variable.id}`;
  const wide = isWideVariable(variable);

  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <label id={labelId} htmlFor={controlId} className={cn("mb-1 block text-caption font-medium text-text-secondary", hideLabel && "sr-only")}>
        <span className="break-words">{variable.name}</span>
        {variable.description && <span className="ml-1.5 font-normal text-text-muted">— {variable.description}</span>}
      </label>
      <Control id={controlId} labelId={labelId} variable={variable} value={value} onChange={onChange} placeholder={variable.defaultValue || t("prompt.enterValue")} />
    </div>
  );
}

/** Geniş girdiler (çip/renk/görsel seçenekler, çoklu seçim, kaydırıcı) iki sütunlu yerleşimde tam satır alır. */
export function isWideVariable(variable: PromptVariableSpec): boolean {
  const visual = isChoice(variable) && (allOptionsHaveImage(variable.options) || allOptionsHaveColor(variable.options));
  return visual || variable.type === "multi_select" || variable.type === "slider" || (variable.type === "select" && variable.options.length <= CHIP_LIMIT);
}

function isChoice(variable: PromptVariableSpec): boolean {
  return variable.type === "select" || variable.type === "multi_select";
}

/**
 * Options that carry the author's own image: shown as cards (thumbnail on
 * top, name below). Single choice behaves like radios, multiple choice like
 * checkboxes. Only used when EVERY option has an image.
 */
function OptionCards({
  id,
  labelId,
  options,
  multiple,
  isSelected,
  onToggle,
}: {
  id: string;
  labelId: string;
  options: PromptVariableOption[];
  multiple: boolean;
  isSelected: (option: PromptVariableOption) => boolean;
  onToggle: (option: PromptVariableOption) => void;
}) {
  return (
    <div id={id} role={multiple ? "group" : "radiogroup"} aria-labelledby={labelId} className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {options.map((option) => {
        const selected = isSelected(option);
        return (
          <button
            key={option.value}
            type="button"
            role={multiple ? undefined : "radio"}
            aria-checked={multiple ? undefined : selected}
            aria-pressed={multiple ? selected : undefined}
            onClick={() => onToggle(option)}
            className={cn(
              "group relative flex min-w-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition-[border-color,box-shadow] duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-border-strong",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a small user-supplied data URL */}
            <img src={option.image} alt="" className="aspect-square w-full rounded-md object-cover" />
            <span className="truncate px-0.5 text-caption font-medium text-text">{option.label}</span>
            {selected && (
              <span aria-hidden className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs">
                <Check size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Chip with the option's own color dot — used when every option has a color. */
function SwatchChip({ option, ...props }: { option: PromptVariableOption } & React.ComponentProps<typeof Chip>) {
  return (
    <Chip {...props}>
      <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border border-border-strong" style={{ backgroundColor: option.color }} />
      {option.label}
    </Chip>
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

  if (isChoice(variable) && allOptionsHaveImage(variable.options)) {
    const multiple = variable.type === "multi_select";
    const selected = new Set(parseMultiValue(value));
    return (
      <OptionCards
        id={id}
        labelId={labelId}
        options={variable.options}
        multiple={multiple}
        isSelected={(option) => (multiple ? selected.has(option.value) : value === option.value)}
        onToggle={(option) => onChange(multiple ? toggleMultiValue(value, option.value, variable.options) : option.value)}
      />
    );
  }

  if (isChoice(variable) && allOptionsHaveColor(variable.options)) {
    const multiple = variable.type === "multi_select";
    const selected = new Set(parseMultiValue(value));
    return (
      <div id={id} role={multiple ? "group" : "radiogroup"} aria-labelledby={labelId}>
        <ChipRow>
          {variable.options.map((option) => {
            const isOn = multiple ? selected.has(option.value) : value === option.value;
            return (
              <SwatchChip
                key={option.value}
                option={option}
                role={multiple ? undefined : "radio"}
                aria-checked={multiple ? undefined : isOn}
                aria-pressed={multiple ? isOn : undefined}
                selected={isOn}
                onClick={() => onChange(multiple ? toggleMultiValue(value, option.value, variable.options) : option.value)}
              />
            );
          })}
        </ChipRow>
      </div>
    );
  }

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
