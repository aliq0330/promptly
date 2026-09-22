"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { makeFieldKeyFromLabel, isConditionSatisfiable } from "@/lib/generator-template";
import type { GeneratorCategory, GeneratorField, GeneratorFieldType } from "@/types";

const FIELD_TYPE_LABELS: Record<GeneratorFieldType, string> = {
  text: "Kısa Metin",
  textarea: "Uzun Metin",
  select: "Seçim Listesi",
  multi_select: "Çoklu Seçim",
  number: "Sayı",
  slider: "Kaydırıcı",
  color: "Renk",
  checkbox: "Onay Kutusu",
  toggle: "Açma/Kapama",
  radio: "Tekli Seçim (Radio)",
  url: "Bağlantı (URL)",
};

const OPTION_TYPES: GeneratorFieldType[] = ["select", "multi_select", "radio"];
const RANGE_TYPES: GeneratorFieldType[] = ["number", "slider"];

function emptyField(categoryId: string, existingKeys: string[]): GeneratorField {
  return {
    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryId,
    key: makeFieldKeyFromLabel("field", existingKeys),
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
 */
export function FieldEditorModal({
  initial,
  isNew,
  categories,
  allFields,
  activeCategoryId,
  onClose,
  onSave,
  onDelete,
}: {
  initial: GeneratorField | null;
  isNew: boolean;
  categories: GeneratorCategory[];
  allFields: GeneratorField[];
  activeCategoryId: string | null;
  onClose: () => void;
  onSave: (field: GeneratorField) => void;
  onDelete?: () => void;
}) {
  const existingKeys = allFields.filter((f) => f.id !== initial?.id).map((f) => f.key);
  const [draft, setDraft] = useState<GeneratorField>(
    () => initial ?? emptyField(activeCategoryId ?? categories[0]?.id ?? "", existingKeys),
  );
  const [keyTouched, setKeyTouched] = useState(!isNew);
  const [optionDraft, setOptionDraft] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const keyError = !draft.key.trim()
    ? "Değişken adı boş olamaz."
    : !/^[a-z0-9_]+$/.test(draft.key)
      ? "Değişken adı yalnızca küçük harf, rakam ve alt çizgi (_) içerebilir."
      : existingKeys.includes(draft.key)
        ? "Bu değişken adı zaten kullanılıyor."
        : null;
  const labelError = draft.label.trim().length === 0 ? "Alan adı boş olamaz." : null;
  const optionsError = OPTION_TYPES.includes(draft.type) && draft.options.length === 0 ? "En az bir seçenek eklemelisin." : null;

  function updateLabel(label: string) {
    setDraft((prev) => ({ ...prev, label, key: keyTouched ? prev.key : makeFieldKeyFromLabel(label, existingKeys) }));
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
    const value = optionDraft.trim();
    if (!value || draft.options.includes(value)) return;
    setDraft((prev) => ({ ...prev, options: [...prev.options, value] }));
    setOptionDraft("");
  }

  function removeOption(option: string) {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.filter((o) => o !== option),
      defaultValue: Array.isArray(prev.defaultValue)
        ? prev.defaultValue.filter((v) => v !== option)
        : prev.defaultValue === option
          ? ""
          : prev.defaultValue,
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setKeyTouched(true);
    if (keyError || labelError || optionsError) return;
    onSave(draft);
  }

  const conditionSources = allFields.filter((f) => f.id !== draft.id && OPTION_TYPES.includes(f.type) && f.options.length > 0);

  return (
    <Modal onClose={onClose} labelledBy="field-editor-title">
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="field-editor-title" className="text-base font-semibold text-text">
            {isNew ? "Alan Oluştur" : "Alanı Düzenle"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-label" className="mb-1.5 block text-sm font-medium text-text">
              Alan adı
            </label>
            <input
              id="field-label"
              type="text"
              autoFocus
              value={draft.label}
              onChange={(event) => updateLabel(event.target.value)}
              placeholder="Örn. Göz rengi"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
            {labelError && <p className="mt-1 text-xs text-red-500">{labelError}</p>}
          </div>

          <div>
            <label htmlFor="field-description" className="mb-1.5 block text-sm font-medium text-text">
              Açıklama <span className="text-text-muted">(opsiyonel)</span>
            </label>
            <textarea
              id="field-description"
              rows={2}
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Bu alan ne belirler?"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="field-category" className="mb-1.5 block text-sm font-medium text-text">
                Kategori
              </label>
              <select
                id="field-category"
                value={draft.categoryId}
                onChange={(event) => setDraft((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="field-type" className="mb-1.5 block text-sm font-medium text-text">
                Field Type
              </label>
              <select
                id="field-type"
                value={draft.type}
                onChange={(event) => updateType(event.target.value as GeneratorFieldType)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text"
              >
                {(Object.keys(FIELD_TYPE_LABELS) as GeneratorFieldType[]).map((type) => (
                  <option key={type} value={type}>
                    {FIELD_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="field-key" className="mb-1.5 block text-sm font-medium text-text">
              Variable
            </label>
            <input
              id="field-key"
              type="text"
              value={draft.key}
              onChange={(event) => {
                setKeyTouched(true);
                setDraft((prev) => ({ ...prev, key: event.target.value.toLowerCase() }));
              }}
              className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-text"
            />
            <p className="mt-1 font-mono text-xs text-primary">{`{{${draft.key || "…"}}}`}</p>
            {keyError && <p className="mt-1 text-xs text-red-500">{keyError}</p>}
          </div>

          {OPTION_TYPES.includes(draft.type) && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">Options</label>
              <div className="mb-2 space-y-1.5">
                {draft.options.map((option) => (
                  <div key={option} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text">
                    <span className="flex-1">{option}</span>
                    <button type="button" onClick={() => removeOption(option)} className="text-text-muted hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={optionDraft}
                  onChange={(event) => setOptionDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Yeni seçenek"
                  className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
                />
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus size={14} /> Option
                </Button>
              </div>
              {optionsError && <p className="mt-1 text-xs text-red-500">{optionsError}</p>}
            </div>
          )}

          <DefaultValueField draft={draft} onChange={(defaultValue) => setDraft((prev) => ({ ...prev, defaultValue }))} />

          <div className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-text"
            >
              Advanced
              <span className="text-xs text-text-muted">{showAdvanced ? "Gizle" : "Göster"}</span>
            </button>
            {showAdvanced && (
              <div className="space-y-3 border-t border-border p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(event) => setDraft((prev) => ({ ...prev, required: event.target.checked }))}
                  />
                  Required
                </label>

                {!OPTION_TYPES.includes(draft.type) && draft.type !== "checkbox" && draft.type !== "toggle" && (
                  <div>
                    <label htmlFor="field-placeholder" className="mb-1 block text-xs text-text-muted">
                      Placeholder
                    </label>
                    <input
                      id="field-placeholder"
                      type="text"
                      value={draft.placeholder}
                      onChange={(event) => setDraft((prev) => ({ ...prev, placeholder: event.target.value }))}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-text"
                    />
                  </div>
                )}

                {RANGE_TYPES.includes(draft.type) && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-text-muted">Minimum</label>
                      <input
                        type="number"
                        value={draft.min ?? ""}
                        onChange={(event) => setDraft((prev) => ({ ...prev, min: event.target.value === "" ? null : Number(event.target.value) }))}
                        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-text"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-text-muted">Maximum</label>
                      <input
                        type="number"
                        value={draft.max ?? ""}
                        onChange={(event) => setDraft((prev) => ({ ...prev, max: event.target.value === "" ? null : Number(event.target.value) }))}
                        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-text"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-text-muted">Step</label>
                      <input
                        type="number"
                        value={draft.step ?? ""}
                        onChange={(event) => setDraft((prev) => ({ ...prev, step: event.target.value === "" ? null : Number(event.target.value) }))}
                        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-text"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="field-condition-source" className="mb-1 block text-xs text-text-muted">
                    Görünürlük (§34 — koşullu alan)
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="field-condition-source"
                      value={draft.condition?.fieldKey ?? ""}
                      onChange={(event) => {
                        const fieldKey = event.target.value;
                        if (!fieldKey) {
                          setDraft((prev) => ({ ...prev, condition: null }));
                          return;
                        }
                        const source = conditionSources.find((f) => f.key === fieldKey);
                        setDraft((prev) => ({ ...prev, condition: { fieldKey, equals: source?.options[0] ?? "" } }));
                      }}
                      className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm text-text"
                    >
                      <option value="">Her zaman görünür</option>
                      {conditionSources.map((source) => (
                        <option key={source.id} value={source.key}>
                          {source.label} =
                        </option>
                      ))}
                    </select>
                    {draft.condition && (
                      <select
                        value={draft.condition.equals}
                        onChange={(event) => setDraft((prev) => (prev.condition ? { ...prev, condition: { ...prev.condition, equals: event.target.value } } : prev))}
                        className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm text-text"
                      >
                        {(conditionSources.find((f) => f.key === draft.condition?.fieldKey)?.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {draft.condition && !isConditionSatisfiable(draft.condition, allFields) && (
                    <p className="mt-1 text-xs text-red-500">Seçilen koşul kaynağı artık geçerli değil.</p>
                  )}
                </div>
              </div>
            )}
          </div>

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
                  className={cn("text-sm font-medium", confirmDelete ? "text-red-600" : "text-text-muted hover:text-red-600")}
                >
                  {confirmDelete ? "Emin misin? Tekrar tıkla" : "Sil"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">{isNew ? "Add Field" : "Kaydet"}</Button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function DefaultValueField({ draft, onChange }: { draft: GeneratorField; onChange: (value: string | string[]) => void }) {
  if (draft.type === "multi_select") {
    const selected = Array.isArray(draft.defaultValue) ? draft.defaultValue : [];
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text">Default value</label>
        <div className="flex flex-wrap gap-2">
          {draft.options.length === 0 ? (
            <p className="text-xs text-text-muted">Önce seçenek ekle.</p>
          ) : (
            draft.options.map((option) => {
              const isOn = selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange(isOn ? selected.filter((o) => o !== option) : [...selected, option])}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    isOn ? "border-primary bg-primary text-primary-foreground" : "border-border text-text-muted",
                  )}
                >
                  {option}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (draft.type === "select" || draft.type === "radio") {
    const value = Array.isArray(draft.defaultValue) ? "" : draft.defaultValue;
    return (
      <div>
        <label htmlFor="field-default" className="mb-1.5 block text-sm font-medium text-text">
          Default value
        </label>
        <select id="field-default" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text">
          <option value="">Yok</option>
          {draft.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (draft.type === "checkbox" || draft.type === "toggle") {
    return (
      <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={draft.defaultValue === "true"} onChange={(event) => onChange(String(event.target.checked))} />
        Varsayılan olarak açık
      </label>
    );
  }

  const value = Array.isArray(draft.defaultValue) ? "" : draft.defaultValue;
  return (
    <div>
      <label htmlFor="field-default" className="mb-1.5 block text-sm font-medium text-text">
        Default value <span className="text-text-muted">(opsiyonel)</span>
      </label>
      <input
        id="field-default"
        type={draft.type === "number" || draft.type === "slider" ? "number" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text"
      />
    </div>
  );
}
