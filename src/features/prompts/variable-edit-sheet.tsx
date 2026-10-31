"use client";

import { useState } from "react";
import { ChevronDown, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { isValidVariableName, normalizeVariableName } from "@/lib/prompt-variables";
import {
  convertSpec,
  isChoiceType,
  normalizeVariable,
  parseMultiValue,
  validateCondition,
  validateSpec,
  type ConditionError,
  type VariableSpecError,
} from "@/lib/prompt-variable-types";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import type { PromptVariableType } from "@/types";
import type { DraftVariable } from "./prompt-text-editor";
import { VariableConditionEditor } from "./variable-condition-editor";
import { SHEET_INPUT_CLASS, sheetPillClassName, VariableSheetFrame } from "./variable-sheet-frame";
import { VariableSpecEditor, type SpecEditorValue, type VariableFormValues } from "./variable-spec-editor";

const MAIN_TYPES: { type: PromptVariableType; label: TranslationKey }[] = [
  { type: "text", label: "variable.type.text" },
  { type: "select", label: "promptEdit.typeBasic.select" },
  { type: "number", label: "variable.type.number" },
  { type: "toggle", label: "variable.type.toggle" },
];

const MORE_TYPES: { type: PromptVariableType; label: TranslationKey }[] = [
  { type: "multi_select", label: "variable.type.multiSelect" },
  { type: "slider", label: "variable.type.slider" },
];

const SPEC_ERROR_KEYS: Record<Exclude<VariableSpecError, null>, TranslationKey> = {
  optionsTooFew: "variable.error.optionsTooFew",
  rangeInvalid: "variable.error.rangeInvalid",
  toggleOnEmpty: "variable.error.toggleOnEmpty",
  toggleSame: "variable.error.toggleSame",
};

/**
 * Metindeki değişkene dokununca açılan düzenleme sayfası (docs/history/288-*, eski `VariableEditorModal`'ın yerine): üstte yalnız en çok
 * gereken — ad, "Nasıl doldurulsun?" (Metin · Seçenekli · Sayı · Aç/Kapa) ve türe göre tek kutuluk içerik (seçenekler yaz-Enter çipleri,
 * metin için varsayılan değer). Çoklu seçim/kaydırıcı, seçenek ayrıntıları (değer, görsel, renk), açıklama ve koşul "Gelişmiş"in içindedir;
 * sayı/kaydırıcı/aç-kapa ayarları (aralık, metinler) türün kendisi olduğu için doğrudan görünür. Durum eski düzenleyiciyle aynıdır
 * (`SpecEditorValue`), yani kaydedilen veri değişmez; yalnız yüzey sadeleşti.
 */
export function VariableEditSheet({
  editing,
  controllers,
  existingNames,
  usageCount,
  onClose,
  onSubmit,
  onDelete,
}: {
  editing: DraftVariable;
  /** Listede BU değişkenden önce gelenler — koşulu yalnız onlar denetleyebilir. */
  controllers: DraftVariable[];
  /** Diğer değişkenlerin küçük harfli adları (yinelenen ad kontrolü). */
  existingNames: string[];
  /** Metinde bu değişkenin kaç yerde geçtiği (silme uyarısı için). */
  usageCount: number;
  onClose: () => void;
  onSubmit: (values: VariableFormValues) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing.name);
  const [editor, setEditor] = useState<SpecEditorValue>({
    spec: { type: editing.type, options: editing.options, config: editing.config },
    defaultValue: editing.defaultValue,
  });
  const [description, setDescription] = useState(editing.description);
  const [specError, setSpecError] = useState<VariableSpecError>(null);
  const [conditionError, setConditionError] = useState<ConditionError>(null);
  const [touched, setTouched] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [advanced, setAdvanced] = useState(
    () => Boolean(editing.description || editing.config.condition || editing.type === "multi_select" || editing.type === "slider"),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { spec, defaultValue } = editor;
  const choice = isChoiceType(spec.type);
  const normalizedName = normalizeVariableName(name);
  const nameError = !touched
    ? null
    : normalizedName.length === 0
      ? t("variable.nameEmptyError")
      : !isValidVariableName(normalizedName)
        ? t("variable.nameInvalidError")
        : existingNames.includes(normalizedName.toLowerCase())
          ? t("variable.nameDuplicateError")
          : null;

  const mainTypes = MAIN_TYPES.some((entry) => entry.type === spec.type) ? MAIN_TYPES : [...MAIN_TYPES, ...MORE_TYPES.filter((entry) => entry.type === spec.type)];
  const selectedDefaults = new Set(parseMultiValue(defaultValue));
  const filledOptions = spec.options.map((option, index) => ({ option, index })).filter(({ option }) => option.value.trim() !== "" || option.label.trim() !== "");

  function setType(type: PromptVariableType) {
    setSpecError(null);
    setEditor(convertSpec(editor, type, ""));
  }

  function toggleDefault(value: string) {
    if (!value) return;
    if (spec.type === "select") return setEditor({ spec, defaultValue: value });
    const picked = new Set(selectedDefaults);
    if (picked.has(value)) picked.delete(value);
    else picked.add(value);
    setEditor({ spec, defaultValue: spec.options.filter((option) => picked.has(option.value)).map((option) => option.value).join(", ") });
  }

  function removeOption(index: number) {
    const removed = spec.options[index];
    const options = spec.options.filter((_, i) => i !== index);
    let nextDefault = defaultValue;
    if (spec.type === "select") {
      if (defaultValue === removed.value) nextDefault = "";
    } else {
      nextDefault = parseMultiValue(defaultValue).filter((item) => item !== removed.value).join(", ");
    }
    setSpecError(null);
    setEditor({ spec: { ...spec, options }, defaultValue: nextDefault });
  }

  function addOption() {
    const text = newOption.trim();
    if (!text) return;
    setNewOption("");
    if (spec.options.some((option) => option.value === text)) return;
    // Boş satırlar (türe geçişte açılanlar) yeni seçeneğe yer açsın.
    const options = [...spec.options.filter((option) => option.value.trim() !== "" || option.label.trim() !== ""), { label: text, value: text }];
    setSpecError(null);
    setEditor({ spec: { ...spec, options }, defaultValue: spec.type === "select" && !defaultValue ? text : defaultValue });
  }

  function submit() {
    setTouched(true);
    if (!normalizedName || !isValidVariableName(normalizedName) || existingNames.includes(normalizedName.toLowerCase())) return;
    const problem = validateSpec(spec);
    const conditionProblem = validateCondition(spec.config.condition, controllers);
    setSpecError(problem);
    setConditionError(conditionProblem);
    if (problem || conditionProblem) {
      if (conditionProblem) setAdvanced(true);
      return;
    }
    const normalized = normalizeVariable(spec, defaultValue);
    onSubmit({ ...normalized.spec, name: normalizedName, defaultValue: normalized.defaultValue, description });
  }

  return (
    <VariableSheetFrame
      title={`{${editing.name}}`}
      mono
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button
            type="button"
            variant={confirmingDelete ? "danger" : "outline"}
            size="lg"
            onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
            data-testid="variable-delete"
            className={confirmingDelete ? undefined : "text-danger"}
          >
            <Trash2 size={16} aria-hidden /> {t("common.delete")}
          </Button>
          <Button type="submit" size="lg" className="flex-1" data-testid="variable-edit-submit">
            {t("common.done")}
          </Button>
        </>
      }
    >
      {confirmingDelete && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-3 text-small font-medium text-danger">
          <span className="flex-1">{usageCount > 0 ? t("variable.deleteWithUsagesConfirm", { count: usageCount }) : t("variable.deleteConfirm")}</span>
          <button type="button" onClick={() => setConfirmingDelete(false)} aria-label={t("common.cancel")} className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-danger/15">
            <X size={14} aria-hidden />
          </button>
        </p>
      )}

      <div>
        <label htmlFor="variable-edit-name" className="mb-2 block text-body font-semibold text-text">
          {t("variable.nameLabel")}
        </label>
        <input
          id="variable-edit-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={Boolean(nameError)}
          autoComplete="off"
          className={`${SHEET_INPUT_CLASS} font-mono`}
        />
        {nameError && (
          <p role="alert" className="mt-1.5 text-caption font-semibold text-danger">
            {nameError}
          </p>
        )}
      </div>

      <div role="group" aria-labelledby="variable-edit-fill-as">
        <div id="variable-edit-fill-as" className="mb-2 text-body font-semibold text-text">
          {t("promptEdit.fillAs")}
        </div>
        <div className="flex flex-wrap gap-2">
          {mainTypes.map((entry) => (
            <button key={entry.type} type="button" className={sheetPillClassName(spec.type === entry.type)} aria-pressed={spec.type === entry.type} data-variable-type={entry.type} onClick={() => setType(entry.type)}>
              {t(entry.label)}
            </button>
          ))}
        </div>
      </div>

      {spec.type === "text" && (
        <div>
          <label htmlFor="variable-edit-default" className="mb-2 block text-body font-semibold text-text">
            {t("variable.defaultValueLabel")} <span className="text-caption font-normal text-text-muted">({t("common.optional")})</span>
          </label>
          <input
            id="variable-edit-default"
            type="text"
            value={defaultValue}
            onChange={(event) => setEditor({ spec, defaultValue: event.target.value })}
            placeholder={t("variable.defaultValuePlaceholder")}
            className={SHEET_INPUT_CLASS}
          />
        </div>
      )}

      {choice && (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-body font-semibold text-text">{t("variable.optionsLabel")}</span>
            <span className="text-caption text-text-muted">{t("promptEdit.defaultFilled")}</span>
          </div>
          {filledOptions.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2" data-variable-options>
              {filledOptions.map(({ option, index }) => {
                const isDefault = spec.type === "select" ? defaultValue === option.value && option.value !== "" : selectedDefaults.has(option.value);
                const label = option.label || option.value;
                return (
                  <li key={index} className="inline-flex items-center">
                    <button type="button" className={cn(sheetPillClassName(isDefault), "rounded-r-none pr-3")} aria-pressed={isDefault} disabled={!option.value} onClick={() => toggleDefault(option.value)}>
                      {label}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      aria-label={t("variable.optionRemoveAria", { n: index + 1 })}
                      className="grid h-10 w-9 place-items-center rounded-r-full border border-l-0 border-border-strong bg-surface-soft text-text-muted transition-colors hover:text-danger"
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newOption}
              onChange={(event) => setNewOption(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  addOption();
                }
              }}
              placeholder={t("promptEdit.optionPlaceholder")}
              aria-label={t("variable.addOption")}
              data-testid="variable-option-input"
              enterKeyHint="done"
              className={SHEET_INPUT_CLASS}
            />
            <Button type="button" variant="secondary" size="lg" className="h-12 shrink-0 px-5" onClick={addOption}>
              {t("variable.add")}
            </Button>
          </div>
        </div>
      )}

      {!choice && spec.type !== "text" && (
        <VariableSpecEditor idPrefix="variable-edit" value={editor} onChange={(next) => { setEditor(next); setSpecError(null); }} hideTypePicker />
      )}

      {specError && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {t(SPEC_ERROR_KEYS[specError])}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => setAdvanced((open) => !open)}
          aria-expanded={advanced}
          data-testid="variable-advanced"
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-body font-semibold text-text-secondary"
        >
          <span>{t("promptEdit.advanced")}</span>
          <span className="flex items-center gap-1.5 text-caption font-normal text-text-muted">
            {t("promptEdit.advancedHint")}
            <ChevronDown size={16} aria-hidden className={cn("transition-transform duration-200", advanced && "rotate-180")} />
          </span>
        </button>
        <Collapsible open={advanced}>
          <div className="space-y-4 pt-2">
            <div role="group" aria-label={t("promptEdit.moreTypes")}>
              <div className="mb-2 text-label font-medium text-text-secondary">{t("promptEdit.moreTypes")}</div>
              <div className="flex flex-wrap gap-2">
                {MORE_TYPES.map((entry) => (
                  <button key={entry.type} type="button" className={sheetPillClassName(spec.type === entry.type)} aria-pressed={spec.type === entry.type} onClick={() => setType(entry.type)}>
                    {t(entry.label)}
                  </button>
                ))}
              </div>
            </div>

            {choice && <VariableSpecEditor idPrefix="variable-edit-detail" value={editor} onChange={(next) => { setEditor(next); setSpecError(null); }} hideTypePicker />}

            <div>
              <label htmlFor="variable-edit-description" className="mb-1.5 block text-label font-medium text-text">
                {t("variable.descriptionLabel")} <span className="text-text-muted">({t("common.optional")})</span>
              </label>
              <textarea
                id="variable-edit-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("variable.descriptionPlaceholder")}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[16px] text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
              />
            </div>

            <VariableConditionEditor
              idPrefix="variable-edit"
              condition={spec.config.condition}
              controllers={controllers}
              onChange={(condition) => {
                setEditor((prev) => ({ ...prev, spec: { ...prev.spec, config: { ...prev.spec.config, condition } } }));
                setConditionError(null);
              }}
              error={conditionError}
            />
          </div>
        </Collapsible>
      </div>
    </VariableSheetFrame>
  );
}
