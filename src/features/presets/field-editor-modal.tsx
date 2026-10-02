"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  PRESET_FIELD_TYPES,
  defaultConfig,
  emptyField,
  emptyOption,
  isOptionField,
  moveItem,
  sanitizeValue,
  type PresetField,
  type PresetFieldType,
  type PresetOption,
  type PresetValue,
} from "@/lib/preset-fields";
import { cn } from "@/lib/utils";
import { PresetFieldInput } from "./preset-field-input";

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const TYPE_KEYS = {
  single_select: ["presetFieldType.single_select", "presetFieldType.single_select_hint"],
  multi_select: ["presetFieldType.multi_select", "presetFieldType.multi_select_hint"],
  dropdown: ["presetFieldType.dropdown", "presetFieldType.dropdown_hint"],
  text: ["presetFieldType.text", "presetFieldType.text_hint"],
  number: ["presetFieldType.number", "presetFieldType.number_hint"],
  slider: ["presetFieldType.slider", "presetFieldType.slider_hint"],
  toggle: ["presetFieldType.toggle", "presetFieldType.toggle_hint"],
  color: ["presetFieldType.color", "presetFieldType.color_hint"],
} as const;

/**
 * Create / edit ONE preset field: its name, type, options (add, rename,
 * delete, reorder), the type's settings (range for sliders/numbers, a
 * placeholder for text) and — when `showDefault` — the value it starts with.
 * Pure editor: it hands the finished field back through `onSave`; where it is
 * stored (the user's field library, or just the preset being built) is the
 * caller's decision.
 */
export function FieldEditorModal({
  initial,
  contentType,
  showDefault = false,
  initialValue,
  onSave,
  onClose,
}: {
  initial: PresetField | null;
  contentType?: string;
  showDefault?: boolean;
  initialValue?: PresetValue;
  onSave: (field: PresetField, defaultValue: PresetValue | undefined) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [field, setField] = useState<PresetField>(() => initial ?? { ...emptyField(), contentTypes: contentType ? [contentType] : [] });
  const [defaultValue, setDefaultValue] = useState<PresetValue | undefined>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusLast = useRef(false);
  const editing = Boolean(initial);

  const cleanDefault = useMemo(() => sanitizeValue(field, defaultValue), [field, defaultValue]);

  function patch(next: Partial<PresetField>) {
    setField((current) => ({ ...current, ...next }));
  }

  function changeType(type: PresetFieldType) {
    if (type === field.type) return;
    setField((current) => ({
      ...current,
      type,
      config: { ...defaultConfig(type), placeholder: current.config.placeholder },
      options: isOptionField(type) ? current.options : [],
    }));
    setDefaultValue(undefined);
  }

  function patchOption(index: number, change: (option: PresetOption) => PresetOption) {
    setField((current) => ({ ...current, options: current.options.map((o, i) => (i === index ? change(o) : o)) }));
  }

  function addOption() {
    focusLast.current = true;
    setField((current) => ({ ...current, options: [...current.options, emptyOption(current.id, current.options.length)] }));
  }

  async function handleSave() {
    const name = field.name.trim();
    if (!name) return setError(t("fieldEditor.errorName"));
    let options: PresetOption[] = [];
    if (isOptionField(field.type)) {
      options = field.options
        .map((o, index) => ({ ...o, label: o.label.trim(), value: (o.value || o.label).trim(), sortOrder: index }))
        .filter((o) => o.label !== "");
      if (options.length === 0) return setError(t("fieldEditor.errorOptions"));
      const seen = new Set<string>();
      for (const option of options) {
        const key = option.value.toLowerCase();
        if (seen.has(key)) return setError(t("fieldEditor.errorDuplicate", { name: option.label }));
        seen.add(key);
      }
    }
    if ((field.type === "slider" || field.type === "number") && field.config.min !== undefined && field.config.max !== undefined && field.config.min >= field.config.max) {
      return setError(t("fieldEditor.errorRange"));
    }
    setError(null);
    setSaving(true);
    try {
      const finished: PresetField = { ...field, name, options, i18n: undefined };
      await onSave(finished, sanitizeValue(finished, defaultValue));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("fieldEditor.errorSave"));
      setSaving(false);
    }
  }

  const draftForInput: PresetField = { ...field, name: field.name || t("fieldEditor.untitled"), options: field.options.filter((o) => o.label.trim() !== "").map((o) => ({ ...o, value: o.value || o.label })) };

  return (
    <Modal onClose={onClose} labelledBy="field-editor-title">
      <div onClick={(event) => event.stopPropagation()} className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
          <h2 id="field-editor-title" className="text-h3 font-semibold text-text">
            {editing ? t("fieldEditor.titleEdit") : t("fieldEditor.titleNew")}
          </h2>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div>
            <label htmlFor="field-name" className="mb-1.5 block text-label font-medium text-text">
              {t("fieldEditor.nameLabel")} <span className="text-danger">*</span>
            </label>
            <input id="field-name" value={field.name} maxLength={60} autoFocus onChange={(event) => patch({ name: event.target.value })} placeholder={t("fieldEditor.namePlaceholder")} className={cn(INPUT, "h-10")} />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-label font-medium text-text">{t("fieldEditor.typeLabel")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_FIELD_TYPES.map((type) => {
                const [labelKey, hintKey] = TYPE_KEYS[type];
                const selected = field.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => changeType(type)}
                    data-field-type={type}
                    className={cn(
                      "min-h-12 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-soft",
                    )}
                  >
                    <span className="block text-small font-semibold text-text">{t(labelKey)}</span>
                    <span className="block text-caption text-text-secondary">{t(hintKey)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {isOptionField(field.type) && (
            <section aria-labelledby="field-options-title">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 id="field-options-title" className="text-label font-medium text-text">
                  {t("fieldEditor.optionsLabel")} <span className="text-text-muted">({field.options.length})</span>
                </h3>
              </div>
              <p className="mb-2 text-caption text-text-secondary">{t("fieldEditor.optionsHint")}</p>
              <ul className="space-y-2">
                {field.options.map((option, index) => (
                  <li key={option.id} className="flex items-start gap-1.5" data-option-row>
                    <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
                      <input
                        ref={(node) => {
                          optionRefs.current[index] = node;
                          if (node && focusLast.current && index === field.options.length - 1) {
                            focusLast.current = false;
                            node.focus();
                          }
                        }}
                        value={option.label}
                        maxLength={80}
                        aria-label={t("fieldEditor.optionNameAria", { index: index + 1 })}
                        placeholder={t("fieldEditor.optionNamePlaceholder")}
                        onChange={(event) => {
                          const label = event.target.value;
                          patchOption(index, (o) => ({ ...o, label, value: o.value === o.label || o.value === "" ? label : o.value, fragment: undefined }));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addOption();
                          }
                        }}
                        className={cn(INPUT, "h-9")}
                      />
                      <input
                        value={option.value === option.label ? "" : option.value}
                        maxLength={200}
                        aria-label={t("fieldEditor.optionValueAria", { index: index + 1 })}
                        placeholder={t("fieldEditor.optionValuePlaceholder")}
                        onChange={(event) => patchOption(index, (o) => ({ ...o, value: event.target.value || o.label, fragment: undefined }))}
                        className={cn(INPUT, "h-9")}
                      />
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button type="button" aria-label={t("fieldEditor.moveUp")} disabled={index === 0} onClick={() => patch({ options: moveItem(field.options, index, -1) })} className="grid h-9 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text disabled:opacity-30">
                        <ArrowUp size={15} />
                      </button>
                      <button type="button" aria-label={t("fieldEditor.moveDown")} disabled={index === field.options.length - 1} onClick={() => patch({ options: moveItem(field.options, index, 1) })} className="grid h-9 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text disabled:opacity-30">
                        <ArrowDown size={15} />
                      </button>
                      <button type="button" aria-label={t("fieldEditor.removeOption")} onClick={() => patch({ options: field.options.filter((_, i) => i !== index).map((o, i) => ({ ...o, sortOrder: i })) })} className="grid h-9 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-danger">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="outline" size="sm" onClick={addOption} className="mt-2" data-add-option>
                <Plus size={14} aria-hidden />
                {t("fieldEditor.addOption")}
              </Button>
            </section>
          )}

          {(field.type === "slider" || field.type === "number") && (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t("fieldEditor.rangeLabel")}>
              {(["min", "max", "step"] as const).map((key) => (
                <div key={key}>
                  <label htmlFor={`field-${key}`} className="mb-1 block text-caption font-medium text-text-secondary">
                    {t(`fieldEditor.${key}`)}
                  </label>
                  <input
                    id={`field-${key}`}
                    type="number"
                    value={field.config[key] ?? ""}
                    onChange={(event) => patch({ config: { ...field.config, [key]: event.target.value === "" ? undefined : Number(event.target.value) } })}
                    className={cn(INPUT, "h-9")}
                  />
                </div>
              ))}
              <div>
                <label htmlFor="field-unit" className="mb-1 block text-caption font-medium text-text-secondary">
                  {t("fieldEditor.unit")}
                </label>
                <input id="field-unit" value={field.config.unit ?? ""} maxLength={8} placeholder="%, mm…" onChange={(event) => patch({ config: { ...field.config, unit: event.target.value || undefined } })} className={cn(INPUT, "h-9")} />
              </div>
            </section>
          )}

          {field.type === "text" && (
            <div>
              <label htmlFor="field-placeholder" className="mb-1 block text-label font-medium text-text">
                {t("fieldEditor.placeholderLabel")}
              </label>
              <input id="field-placeholder" value={field.config.placeholder ?? ""} maxLength={80} onChange={(event) => patch({ config: { ...field.config, placeholder: event.target.value || undefined } })} className={cn(INPUT, "h-10")} />
            </div>
          )}

          {showDefault && (
            <section aria-labelledby="field-default-title" className="rounded-md border border-border-soft bg-surface-soft p-3">
              <h3 id="field-default-title" className="mb-2 text-label font-medium text-text">
                {t("fieldEditor.defaultLabel")}
              </h3>
              <PresetFieldInput field={draftForInput} value={cleanDefault} onChange={setDefaultValue} />
            </section>
          )}

          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-soft px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} data-save-field>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
