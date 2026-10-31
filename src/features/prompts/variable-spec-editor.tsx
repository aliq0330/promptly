"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Palette, Plus, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { cn, resizeImageToDataUrlFit } from "@/lib/utils";
import { ImageProcessingError } from "@/lib/image-processing";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  MAX_OPTIONS,
  MAX_OPTION_IMAGE_LENGTH,
  OPTION_IMAGE_MAX_DIMENSION,
  allOptionsHaveColor,
  allOptionsHaveImage,
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
  // The image resize is async; read the LATEST editor state when it resolves, not the render it started in.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadIndex, setUploadIndex] = useState<number | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function pickImage(index: number) {
    setUploadError(null);
    setUploadIndex(index);
    fileInputRef.current?.click();
  }

  async function handleImageChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const index = uploadIndex;
    if (!file || index === null) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      const { url } = await resizeImageToDataUrlFit(file, OPTION_IMAGE_MAX_DIMENSION);
      if (url.length > MAX_OPTION_IMAGE_LENGTH) {
        setUploadError(t("variable.optionImageTooBig"));
        return;
      }
      const current = latest.current;
      if (!current.spec.options[index]) return;
      onChange({
        ...current,
        spec: {
          ...current.spec,
          options: current.spec.options.map((option, i) => (i === index ? { ...option, image: url, color: undefined } : option)),
        },
      });
    } catch (err) {
      setUploadError(err instanceof ImageProcessingError ? err.message : t("variable.optionImageFailed"));
    } finally {
      setUploadBusy(false);
      setUploadIndex(null);
    }
  }

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
  const someImage = spec.options.some((option) => option.image);
  const someColor = spec.options.some((option) => option.color);
  const partialVisual =
    (someImage && !allOptionsHaveImage(spec.options)) || (someColor && !allOptionsHaveColor(spec.options));

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
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 sm:[&>*:last-child]:col-span-2">
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
                    <OptionMedia
                      option={option}
                      n={index + 1}
                      busy={uploadBusy && uploadIndex === index}
                      onPickImage={() => pickImage(index)}
                      onColor={(color) => updateOption(index, { color, image: undefined })}
                      onClear={() => updateOption(index, { image: undefined, color: undefined })}
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
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChosen} />
          {partialVisual && <p className="text-caption text-text-muted">{t("variable.optionVisualPartialHint")}</p>}
          {uploadError && (
            <p role="alert" className="text-xs text-danger">
              {uploadError}
            </p>
          )}
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

/**
 * Per-option "add your own image / color" controls. Nothing is pre-filled:
 * an option starts plain, and an option holds at most one of image / color
 * (adding one replaces the other).
 */
function OptionMedia({
  option,
  n,
  busy,
  onPickImage,
  onColor,
  onClear,
}: {
  option: PromptVariableOption;
  n: number;
  busy: boolean;
  onPickImage: () => void;
  onColor: (color: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const linkButton = "inline-flex items-center gap-1 text-label font-medium text-primary hover:underline disabled:opacity-50";

  if (option.image) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small user-supplied data URL */}
        <img src={option.image} alt="" className="h-10 w-10 rounded-md border border-border object-cover" />
        <button type="button" onClick={onPickImage} disabled={busy} className={linkButton}>
          <ImagePlus size={14} /> {t("variable.optionChangeImage")}
        </button>
        <button type="button" onClick={onClear} className="text-label font-medium text-text-muted hover:text-danger hover:underline">
          {t("variable.optionRemoveImage")}
        </button>
      </div>
    );
  }

  if (option.color) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={option.color}
          onChange={(event) => onColor(event.target.value)}
          aria-label={t("variable.optionColorAria", { n })}
          className="h-10 w-12 cursor-pointer rounded-md border border-border bg-background p-1"
        />
        <span className="font-mono text-xs text-text-muted">{option.color}</span>
        <button type="button" onClick={onClear} className="text-label font-medium text-text-muted hover:text-danger hover:underline">
          {t("variable.optionRemoveColor")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" onClick={onPickImage} disabled={busy} className={linkButton}>
        <ImagePlus size={14} /> {t("variable.optionAddImage")}
      </button>
      <button type="button" onClick={() => onColor("#888888")} className={linkButton}>
        <Palette size={14} /> {t("variable.optionAddColor")}
      </button>
    </div>
  );
}
