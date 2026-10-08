"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn, resizeImageToDataUrlFit } from "@/lib/utils";
import { makeFieldKeyFromLabel, slugifyGeneratorTitle } from "@/lib/generator-template";
import { isValidJsonPath } from "@/lib/generator-output";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { GeneratorField, GeneratorFieldType } from "@/types";

/** Sentinel `imageUploadTarget` value meaning "the image being picked belongs to the not-yet-added option row", not an existing one. */
const NEW_OPTION_IMAGE_TARGET = "__new_option__";

const FIELD_TYPE_LABEL_KEYS: Record<GeneratorFieldType, TranslationKey> = {
  text: "fieldTypeFull.text",
  textarea: "fieldTypeFull.textarea",
  select: "fieldTypeFull.select",
  multi_select: "fieldTypeFull.multiSelect",
  number: "fieldTypeFull.number",
  slider: "fieldTypeFull.slider",
  color: "fieldTypeFull.color",
  checkbox: "fieldTypeFull.checkbox",
  toggle: "fieldTypeFull.toggle",
  radio: "fieldTypeFull.radio",
  url: "fieldTypeFull.url",
};

const OPTION_TYPES: GeneratorFieldType[] = ["select", "multi_select", "radio"];

/** Sanitizes free-typed text into a valid JSON-path segment / option value — same transliteration rules as tag/variable keys elsewhere in this app, just underscored instead of hyphenated. */
function sanitizeSegment(input: string): string {
  return slugifyGeneratorTitle(input).replace(/-/g, "_");
}

function emptyField(existingKeys: string[]): GeneratorField {
  const key = makeFieldKeyFromLabel("field", existingKeys);
  return {
    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    label: "",
    description: "",
    type: "select",
    required: false,
    options: [],
    defaultValue: "",
    placeholder: "",
    min: null,
    max: null,
    step: null,
    order: 0,
    condition: null,
    jsonPath: key,
  };
}

/**
 * "+ Alan ekle" / field-edit modal (§9/§11) — one shared form for both
 * creating a brand-new field and editing an existing one (`initial` is set
 * either way; `isNew` only changes the title/submit label and whether
 * "Sil" is offered). All the "Advanced settings" from §9 (placeholder, min,
 * max, step) are here except two: a free-typed custom value on a
 * select-type field, and a searchable long dropdown — deliberately
 * deferred, see CLAUDE.md; every other advanced setting genuinely works.
 *
 * Also owns the real "Çıktı Eşleme" (Output Mapping) section from the JSON
 * Output Engine architecture correction — every field's real `jsonPath`
 * (where its value lands in the generator's structured JSON output) is set
 * here, with a live single-field JSON preview and autocomplete drawn from
 * every OTHER field's already-used path (§10/§11/§12).
 */
export function FieldEditorModal({
  initial,
  isNew,
  allFields,
  onClose,
  onSave,
  onDelete,
}: {
  initial: GeneratorField | null;
  isNew: boolean;
  allFields: GeneratorField[];
  onClose: () => void;
  onSave: (field: GeneratorField) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const existingKeys = allFields.filter((f) => f.id !== initial?.id).map((f) => f.key);
  const [draft, setDraft] = useState<GeneratorField>(() => initial ?? emptyField(existingKeys));
  const [keyTouched, setKeyTouched] = useState(!isNew);
  const [pathTouched, setPathTouched] = useState(!isNew);
  const [optionLabelDraft, setOptionLabelDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Default/custom option visuals (CLAUDE.md "Generator Hazır Alanları +
  // Varsayılan Görsel Seçenekleri", §8/§9/§10) — a hazır alan's options can
  // already arrive with a real `image`/`color` (see generator-field-catalog.ts);
  // this state only drives the upload UI to VIEW/REPLACE/REMOVE them, scoped
  // to this one generator's own copy of the field (never the shared catalog).
  const [newOptionImage, setNewOptionImage] = useState<string | null>(null);
  const [imageUploadTarget, setImageUploadTarget] = useState<string | null>(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function updateOptionImage(value: string, image: string | undefined) {
    setDraft((prev) => ({ ...prev, options: prev.options.map((o) => (o.value === value ? { ...o, image } : o)) }));
  }

  function updateOptionColor(value: string, color: string | undefined) {
    setDraft((prev) => ({ ...prev, options: prev.options.map((o) => (o.value === value ? { ...o, color } : o)) }));
  }

  function openImagePicker(target: string) {
    setImageUploadError(null);
    setImageUploadTarget(target);
    imageInputRef.current?.click();
  }

  async function handleImageFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = imageUploadTarget;
    if (!file || !target) return;
    setImageUploadBusy(true);
    setImageUploadError(null);
    try {
      const { url } = await resizeImageToDataUrlFit(file, 240);
      if (target === NEW_OPTION_IMAGE_TARGET) setNewOptionImage(url);
      else updateOptionImage(target, url);
    } catch {
      setImageUploadError(t("field.editorImageUploadFailed"));
    } finally {
      setImageUploadBusy(false);
      setImageUploadTarget(null);
    }
  }

  const keyError = !draft.key.trim()
    ? t("field.variableNameEmptyError")
    : !/^[a-z0-9_]+$/.test(draft.key)
      ? t("field.variableNameInvalidChars")
      : existingKeys.includes(draft.key)
        ? t("field.variableNameTaken")
        : null;
  const labelError = draft.label.trim().length === 0 ? t("field.nameEmptyError") : null;
  const optionsError = OPTION_TYPES.includes(draft.type) && draft.options.length === 0 ? t("field.needsAtLeastOneOption") : null;
  const jsonPathError = !draft.jsonPath.trim()
    ? t("field.jsonPathEmptyError")
    : !isValidJsonPath(draft.jsonPath)
      ? t("field.jsonPathInvalidError")
      : null;

  function updateLabel(label: string) {
    setDraft((prev) => {
      const key = keyTouched ? prev.key : makeFieldKeyFromLabel(label, existingKeys);
      const jsonPath = pathTouched ? prev.jsonPath : key;
      return { ...prev, label, key, jsonPath };
    });
  }

  function updateType(type: GeneratorFieldType) {
    setDraft((prev) => ({
      ...prev,
      type,
      defaultValue: type === "multi_select" ? [] : "",
      options: OPTION_TYPES.includes(type) ? prev.options : [],
    }));
  }

  function addOption() {
    const label = optionLabelDraft.trim();
    if (!label) return;
    const value = sanitizeSegment(label);
    if (!value || draft.options.some((o) => o.value === value)) return;
    setDraft((prev) => ({ ...prev, options: [...prev.options, { label, value, image: newOptionImage ?? undefined }] }));
    setOptionLabelDraft("");
    setNewOptionImage(null);
  }

  function removeOption(value: string) {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.filter((o) => o.value !== value),
      defaultValue: Array.isArray(prev.defaultValue)
        ? prev.defaultValue.filter((v) => v !== value)
        : prev.defaultValue === value
          ? ""
          : prev.defaultValue,
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setKeyTouched(true);
    setPathTouched(true);
    if (keyError || labelError || optionsError || jsonPathError) return;
    onSave(draft);
  }

  return (
    <Modal onClose={onClose} labelledBy="field-editor-title">
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="field-editor-title" className="text-base font-semibold text-text">
            {isNew ? t("field.createTitle") : t("field.editTitle")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-label" className="mb-1.5 block text-sm font-medium text-text">
              {t("field.fieldName")}
            </label>
            <input
              id="field-label"
              type="text"
              autoFocus
              value={draft.label}
              onChange={(event) => updateLabel(event.target.value)}
              placeholder={t("field.fieldNamePlaceholder")}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
            />
            {labelError && <p className="mt-1 text-xs text-danger">{labelError}</p>}
            {!labelError && keyError && <p className="mt-1 text-xs text-danger">{keyError}</p>}
          </div>

          <div>
            <label htmlFor="field-description" className="mb-1.5 block text-sm font-medium text-text">
              {t("variable.descriptionLabel")} <span className="text-text-muted">({t("common.optional")})</span>
            </label>
            <textarea
              id="field-description"
              rows={2}
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              placeholder={t("field.descriptionPlaceholder")}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
            />
          </div>

          <div>
            <label htmlFor="field-type" className="mb-1.5 block text-sm font-medium text-text">
              {t("field.fieldTypeLabel")}
            </label>
            <select
              id="field-type"
              value={draft.type}
              onChange={(event) => updateType(event.target.value as GeneratorFieldType)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text"
            >
              {(Object.keys(FIELD_TYPE_LABEL_KEYS) as GeneratorFieldType[]).map((type) => (
                <option key={type} value={type}>
                  {t(FIELD_TYPE_LABEL_KEYS[type])}
                </option>
              ))}
            </select>
          </div>

          {OPTION_TYPES.includes(draft.type) && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">{t("field.optionsLabel")}</label>
              {/* Single hidden file input shared by every "Görsel ekle/değiştir" trigger below — `imageUploadTarget` says which option (or the pending new-option row, via NEW_OPTION_IMAGE_TARGET) the next chosen file belongs to. */}
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileChosen} />
              <div className="mb-2 space-y-1.5">
                {draft.options.map((option) => (
                  <div key={option.value} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text">
                    {option.image ? (
                      <span className="relative h-7 w-7 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview, never a remote asset */}
                        <img src={option.image} alt="" className="h-7 w-7 rounded object-cover" />
                        <button
                          type="button"
                          onClick={() => updateOptionImage(option.value, undefined)}
                          title={t("field.removeImage")}
                          aria-label={t("field.removeImage")}
                          className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-white"
                        >
                          <X size={8} />
                        </button>
                      </span>
                    ) : option.color ? (
                      <input
                        type="color"
                        value={option.color}
                        onChange={(event) => updateOptionColor(option.value, event.target.value)}
                        title={t("field.changeColor")}
                        aria-label={t("field.changeColor")}
                        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-background p-0"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <span className="shrink-0 truncate font-mono text-xs text-text-muted">{option.value}</span>
                    <button
                      type="button"
                      onClick={() => openImagePicker(option.value)}
                      title={option.image ? t("field.changeImage") : t("field.addImage")}
                      aria-label={option.image ? t("field.changeImage") : t("field.addImage")}
                      className="shrink-0 text-text-muted hover:text-primary"
                    >
                      <ImagePlus size={14} />
                    </button>
                    {option.color && (
                      <button
                        type="button"
                        onClick={() => updateOptionColor(option.value, undefined)}
                        title={t("field.removeColor")}
                        aria-label={t("field.removeColor")}
                        className="shrink-0 text-text-muted hover:text-danger"
                      >
                        <X size={12} />
                      </button>
                    )}
                    <button type="button" onClick={() => removeOption(option.value)} title={t("field.deleteOption")} aria-label={t("field.deleteOption")} className="shrink-0 text-text-muted hover:text-danger">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={optionLabelDraft}
                  onChange={(event) => {
                    setOptionLabelDraft(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder={t("field.optionLabelPlaceholder")}
                  className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
                />
                <Button type="button" size="sm" onClick={addOption}>
                  {t("field.addInline")}
                </Button>
                <button
                  type="button"
                  onClick={() => (newOptionImage ? setNewOptionImage(null) : openImagePicker(NEW_OPTION_IMAGE_TARGET))}
                  title={newOptionImage ? t("field.removeImage") : t("field.uploadImage")}
                  aria-label={newOptionImage ? t("field.removeImage") : t("field.uploadImage")}
                  className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", newOptionImage ? "border-primary" : "border-border text-text-muted hover:text-primary")}
                >
                  {newOptionImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL preview, never a remote asset
                    <img src={newOptionImage} alt="" className="h-full w-full rounded-md object-cover" />
                  ) : (
                    <ImagePlus size={15} />
                  )}
                </button>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus size={14} /> {t("field.optionButton")}
                </Button>
              </div>
              {imageUploadBusy && <p className="mt-1 text-xs text-text-muted">{t("field.imageUploading")}</p>}
              {imageUploadError && <p className="mt-1 text-xs text-danger">{imageUploadError}</p>}
              {optionsError && <p className="mt-1 text-xs text-danger">{optionsError}</p>}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div>
              {!isNew && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    onDelete();
                  }}
                  className={cn("text-sm font-medium", confirmDelete ? "text-danger" : "text-text-muted hover:text-danger")}
                >
                  {confirmDelete ? t("common.confirmDelete") : t("common.delete")}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{isNew ? t("field.addFieldSubmit") : t("common.save")}</Button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
