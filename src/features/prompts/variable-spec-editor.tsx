"use client";

import { Plus, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  MAX_OPTIONS,
  convertSpec,
  isChoiceType,
  isNumericType,
  parseMultiValue,
  VARIABLE_TYPES,
  type VariableSpecError,
} from "@/lib/prompt-variable-types";
import type { PromptVariableOption, PromptVariableSpec, PromptVariableType } from "@/types";

const TYPE_LABEL_KEYS: Record<PromptVariableType, TranslationKey> = {
  text: "variable.type.text",
  select: "variable.type.select",
  multi_select: "variable.type.multiSelect",
  number: "variable.type.number",
  slider: "variable.type.slider",
  toggle: "variable.type.toggle",
};

const ERROR_KEYS: Record<Exclude<VariableSpecError, null>, TranslationKey> = {
  optionsTooFew: "variable.error.optionsTooFew",
  rangeInvalid: "variable.error.rangeInvalid",
  toggleOnEmpty: "variable.error.toggleOnEmpty",
  toggleSame: "variable.error.toggleSame",
};

export interface SpecEditorValue {
  spec: PromptVariableSpec;
  defaultValue: string;
}

/** What the create/edit variable modals hand back: the identity fields plus the kind-specific spec, already normalized. */
export interface VariableFormValues extends PromptVariableSpec {
  name: string;
  defaultValue: string;
  description: string;
}

/**
 * Editor for the kind-specific part of a variable (CLAUDE.md §9.145): the
 * kind picker, then — depending on the kind — the option list, the numeric
 * range or the toggle texts, and always a default value that is chosen with
 * the kind's own control. Fully controlled; the parent modal owns the state
 * and runs `validateSpec`/`normalizeVariable` on submit.
 */
export function VariableSpecEditor({
  value,
  onChange,
  seedText = "",
  error,
  idPrefix,
}: {
  value: SpecEditorValue;
  onChange: (next: SpecEditorValue) => void;
  /** Text the user selected in the prompt — becomes the first option when switching to a choice kind. */
  seedText?: string;
  error?: VariableSpecError;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const { spec, defaultValue } = value;

  function setType(type: PromptVariableType) {
    onChange(convertSpec(value, type, seedText));
  }

  function setOptions(options: PromptVariableOption[], nextDefault = defaultValue) {
    onChange({ spec: { ...spec, options }, defaultValue: nextDefault });
  }

  function updateOption(index: number, patch: Partial<PromptVariableOption>) {
    const prev = spec.options[index];
    const next = { ...prev, ...patch };
    // The prompt text follows the label until the user writes their own.
    if (patch.label !== undefined && (prev.value === "" || prev.value === prev.label)) next.value = patch.label;
    const options = spec.options.map((option, i) => (i === index ? next : option));
    let nextDefault = defaultValue;
    if (next.value !== prev.value) {
      if (spec.type === "select") {
        if (defaultValue === prev.value) nextDefault = next.value;
      } else {
        nextDefault = parseMultiValue(defaultValue)
          .map((item) => (item === prev.value ? next.value : item))
          .filter(Boolean)
          .join(", ");
      }
    }
    setOptions(options, nextDefault);
  }

  function removeOption(index: number) {
    const removed = spec.options[index];
    let nextDefault = defaultValue;
    if (spec.type === "select") {
      if (defaultValue === removed.value) nextDefault = "";
    } else {
      nextDefault = parseMultiValue(defaultValue)
        .filter((item) => item !== removed.value)
        .join(", ");
    }
    setOptions(
      spec.options.filter((_, i) => i !== index),
      nextDefault,
    );
  }

  function toggleDefault(optionValue: string) {
    if (!optionValue) return;
    if (spec.type === "select") {
      onChange({ spec, defaultValue: optionValue });
      return;
    }
    const selected = new Set(parseMultiValue(defaultValue));
    if (selected.has(optionValue)) selected.delete(optionValue);
    else selected.add(optionValue);
    onChange({
      spec,
      defaultValue: spec.options
        .filter((option) => selected.has(option.value))
        .map((option) => option.value)
        .join(", "),
    });
  }

  function setConfig(patch: Partial<PromptVariableSpec["config"]>, nextDefault = defaultValue) {
    onChange({ spec: { ...spec, config: { ...spec.config, ...patch } }, defaultValue: nextDefault });
  }

  const numberInput = (key: "min" | "max" | "step", label: TranslationKey) => (
    <div>
      <label htmlFor={`${idPrefix}-${key}`} className={fieldLabelClassName}>
        {t(label)}
      </label>
      <input
        id={`${idPrefix}-${key}`}
        type="number"
        inputMode="decimal"
        value={spec.config[key] ?? ""}
        onChange={(event) => setConfig({ [key]: event.target.value === "" ? undefined : Number(event.target.value) })}
        className={fieldInputClassName}
      />
    </div>
  );

  const selectedDefaults = new Set(parseMultiValue(defaultValue));

  return (
    <div className="space-y-4">
      <div>
        <span id={`${idPrefix}-type-label`} className={fieldLabelClassName}>
          {t("variable.typeLabel")}
        </span>
        <div role="group" aria-labelledby={`${idPrefix}-type-label`} className="flex flex-wrap gap-2">
          {VARIABLE_TYPES.map((type) => (
            <Chip key={type} selected={spec.type === type} onClick={() => setType(type)}>
              {t(TYPE_LABEL_KEYS[type])}
            </Chip>
          ))}
        </div>
      </div>

      {spec.type === "text" && (
        <div>
          <label htmlFor={`${idPrefix}-default`} className={fieldLabelClassName}>
            {t("variable.defaultValueLabel")} <span className="text-text-muted">({t("common.optional")})</span>
          </label>
          <input
            id={`${idPrefix}-default`}
            type="text"
            value={defaultValue}
            onChange={(event) => onChange({ spec, defaultValue: event.target.value })}
            placeholder={t("variable.defaultValuePlaceholder")}
            className={fieldInputClassName}
          />
        </div>
      )}

      {isChoiceType(spec.type) && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn(fieldLabelClassName, "mb-0")}>{t("variable.optionsLabel")}</span>
            <span className="text-caption text-text-muted">
              {spec.type === "select" ? t("variable.defaultPickOne") : t("variable.defaultPickMany")}
            </span>
          </div>
          <p className="text-caption text-text-muted">{t("variable.optionsHint")}</p>
          <ul className="space-y-2">
            {spec.options.map((option, index) => {
              const isDefault = spec.type === "select" ? defaultValue === option.value && option.value !== "" : selectedDefaults.has(option.value);
              return (
                <li key={index} className="flex items-start gap-2">
                  <input
                    type={spec.type === "select" ? "radio" : "checkbox"}
                    name={`${idPrefix}-default-option`}
                    checked={isDefault}
                    disabled={!option.value}
                    onChange={() => toggleDefault(option.value)}
                    aria-label={t("variable.optionDefaultAria", { n: index + 1 })}
                    className="mt-3 shrink-0"
                  />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={option.label}
                      onChange={(event) => updateOption(index, { label: event.target.value })}
                      placeholder={t("variable.optionLabelPlaceholder")}
                      aria-label={t("variable.optionLabelAria", { n: index + 1 })}
                      className={cn(fieldControlClassName, "h-10")}
                    />
                    <input
                      type="text"
                      value={option.value}
                      onChange={(event) => updateOption(index, { value: event.target.value })}
                      placeholder={t("variable.optionValuePlaceholder")}
                      aria-label={t("variable.optionValueAria", { n: index + 1 })}
                      className={cn(fieldControlClassName, "h-10 font-mono")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    aria-label={t("variable.optionRemoveAria", { n: index + 1 })}
                    className="mt-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={spec.options.length >= MAX_OPTIONS}
            onClick={() => setOptions([...spec.options, { label: "", value: "" }])}
            className="inline-flex items-center gap-1 text-label font-medium text-primary hover:underline disabled:opacity-50"
          >
            <Plus size={14} /> {t("variable.addOption")}
          </button>
        </div>
      )}

      {isNumericType(spec.type) && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {numberInput("min", "variable.rangeMin")}
            {numberInput("max", "variable.rangeMax")}
            {numberInput("step", "variable.rangeStep")}
          </div>
          <div>
            <label htmlFor={`${idPrefix}-default`} className={fieldLabelClassName}>
              {t("variable.defaultValueLabel")}
            </label>
            <input
              id={`${idPrefix}-default`}
              type="number"
              inputMode="decimal"
              value={defaultValue}
              onChange={(event) => onChange({ spec, defaultValue: event.target.value })}
              className={fieldInputClassName}
            />
          </div>
        </div>
      )}

      {spec.type === "toggle" && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idPrefix}-on`} className={fieldLabelClassName}>
                {t("variable.toggleOnLabel")}
              </label>
              <input
                id={`${idPrefix}-on`}
                type="text"
                value={spec.config.onText ?? ""}
                onChange={(event) =>
                  setConfig({ onText: event.target.value }, defaultValue === (spec.config.onText ?? "") ? event.target.value : defaultValue)
                }
                placeholder={t("variable.toggleOnPlaceholder")}
                className={fieldInputClassName}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-off`} className={fieldLabelClassName}>
                {t("variable.toggleOffLabel")} <span className="text-text-muted">({t("common.optional")})</span>
              </label>
              <input
                id={`${idPrefix}-off`}
                type="text"
                value={spec.config.offText ?? ""}
                onChange={(event) =>
                  setConfig({ offText: event.target.value }, defaultValue === (spec.config.offText ?? "") ? event.target.value : defaultValue)
                }
                className={fieldInputClassName}
              />
            </div>
          </div>
          <div role="radiogroup" aria-label={t("variable.defaultValueLabel")} className="flex flex-wrap gap-2">
            <Chip
              role="radio"
              aria-checked={defaultValue === (spec.config.onText ?? "") && defaultValue !== (spec.config.offText ?? "")}
              aria-pressed={undefined}
              selected={defaultValue === (spec.config.onText ?? "") && defaultValue !== (spec.config.offText ?? "")}
              onClick={() => onChange({ spec, defaultValue: spec.config.onText ?? "" })}
            >
              {t("variable.defaultOn")}
            </Chip>
            <Chip
              role="radio"
              aria-checked={defaultValue === (spec.config.offText ?? "")}
              aria-pressed={undefined}
              selected={defaultValue === (spec.config.offText ?? "")}
              onClick={() => onChange({ spec, defaultValue: spec.config.offText ?? "" })}
            >
              {t("variable.defaultOff")}
            </Chip>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {t(ERROR_KEYS[error])}
        </p>
      )}
    </div>
  );
}
