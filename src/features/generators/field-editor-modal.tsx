"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { makeFieldKeyFromLabel, isConditionSatisfiable, slugifyGeneratorTitle } from "@/lib/generator-template";
import { buildFieldOutputPreview, collectJsonPathGroups, isValidJsonPath, parseJsonPath } from "@/lib/generator-output";
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

/** Sanitizes free-typed text into a valid JSON-path segment / option value — same transliteration rules as tag/variable keys elsewhere in this app, just underscored instead of hyphenated. */
function sanitizeSegment(input: string): string {
  return slugifyGeneratorTitle(input).replace(/-/g, "_");
}

function emptyField(categoryId: string, existingKeys: string[]): GeneratorField {
  const key = makeFieldKeyFromLabel("field", existingKeys);
  return {
    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryId,
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
  const [pathTouched, setPathTouched] = useState(!isNew);
  const [optionLabelDraft, setOptionLabelDraft] = useState("");
  const [optionValueDraft, setOptionValueDraft] = useState("");
  const [optionValueTouched, setOptionValueTouched] = useState(false);
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
  const jsonPathError = !draft.jsonPath.trim()
    ? "JSON yolu boş olamaz."
    : !isValidJsonPath(draft.jsonPath)
      ? "JSON yolu yalnızca harf, rakam, alt çizgi ve nokta içerebilir (örn. subject.eye_color)."
      : null;

  const otherFields = allFields.filter((f) => f.id !== draft.id);
  const existingGroups = collectJsonPathGroups(otherFields);
  const pathSegments = parseJsonPath(draft.jsonPath);
  const pathGroup = pathSegments.length > 1 ? pathSegments[0] : "";
  const pathProperty = pathSegments.length > 1 ? pathSegments.slice(1).join(".") : (pathSegments[0] ?? "");
  const propertySuggestions = Array.from(
    new Set(
      otherFields
        .map((f) => parseJsonPath(f.jsonPath?.trim() || f.key))
        .filter((segments) => (pathGroup ? segments[0] === pathGroup && segments.length > 1 : segments.length === 1))
        .map((segments) => (pathGroup ? segments.slice(1).join(".") : segments[0])),
    ),
  ).sort();

  function updateLabel(label: string) {
    setDraft((prev) => {
      const key = keyTouched ? prev.key : makeFieldKeyFromLabel(label, existingKeys);
      const jsonPath = pathTouched ? prev.jsonPath : key;
      return { ...prev, label, key, jsonPath };
    });
  }

  function updateJsonPath(jsonPath: string) {
    setPathTouched(true);
    setDraft((prev) => ({ ...prev, jsonPath }));
  }

  function updatePathGroup(group: string) {
    setPathTouched(true);
    setDraft((prev) => {
      const property = pathProperty || prev.key;
      const jsonPath = group.trim() ? `${sanitizeSegment(group)}.${property}` : property;
      return { ...prev, jsonPath };
    });
  }

  function updatePathProperty(property: string) {
    setPathTouched(true);
    setDraft((prev) => {
      const sanitizedProperty = sanitizeSegment(property) || property;
      const jsonPath = pathGroup ? `${pathGroup}.${sanitizedProperty}` : sanitizedProperty;
      return { ...prev, jsonPath };
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
    const value = (optionValueTouched ? optionValueDraft.trim() : sanitizeSegment(label)) || sanitizeSegment(label);
    if (!value || draft.options.some((o) => o.value === value)) return;
    setDraft((prev) => ({ ...prev, options: [...prev.options, { label, value }] }));
    setOptionLabelDraft("");
    setOptionValueDraft("");
    setOptionValueTouched(false);
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
                  <div key={option.value} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text">
                    <span className="flex-1 truncate">{option.label}</span>
                    <span className="shrink-0 truncate font-mono text-xs text-text-muted">{option.value}</span>
                    <button type="button" onClick={() => removeOption(option.value)} className="shrink-0 text-text-muted hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={optionLabelDraft}
                  onChange={(event) => {
                    setOptionLabelDraft(event.target.value);
                    if (!optionValueTouched) setOptionValueDraft(sanitizeSegment(event.target.value));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Etiket (ör. Yeşil)"
                  className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
                />
                <input
                  type="text"
                  value={optionValueTouched ? optionValueDraft : sanitizeSegment(optionLabelDraft)}
                  onChange={(event) => {
                    setOptionValueTouched(true);
                    setOptionValueDraft(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Değer (ör. green)"
                  className="h-9 w-28 shrink-0 rounded-md border border-border bg-background px-2 font-mono text-xs text-text placeholder:text-text-muted"
                />
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus size={14} /> Option
                </Button>
              </div>
              {optionsError && <p className="mt-1 text-xs text-red-500">{optionsError}</p>}
            </div>
          )}

          <DefaultValueField draft={draft} onChange={(defaultValue) => setDraft((prev) => ({ ...prev, defaultValue }))} />

          <div className="rounded-md border border-border p-3">
            <p className="mb-0.5 text-sm font-medium text-text">Çıktı Eşleme (Output Mapping)</p>
            <p className="mb-3 text-xs text-text-muted">Bu alanın gerçek değeri, generatorun yapılandırılmış JSON çıktısında nereye yazılsın?</p>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="field-path-group" className="mb-1 block text-xs text-text-muted">
                  Çıktı Grubu <span className="text-text-muted">(opsiyonel)</span>
                </label>
                <input
                  id="field-path-group"
                  type="text"
                  list="field-path-group-suggestions"
                  value={pathGroup}
                  onChange={(event) => updatePathGroup(event.target.value)}
                  placeholder="ör. subject"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-text placeholder:text-text-muted"
                />
                <datalist id="field-path-group-suggestions">
                  {existingGroups.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="field-path-property" className="mb-1 block text-xs text-text-muted">
                  Özellik Adı
                </label>
                <input
                  id="field-path-property"
                  type="text"
                  list="field-path-property-suggestions"
                  value={pathProperty}
                  onChange={(event) => updatePathProperty(event.target.value)}
                  placeholder="ör. eye_color"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-text placeholder:text-text-muted"
                />
                <datalist id="field-path-property-suggestions">
                  {propertySuggestions.map((property) => (
                    <option key={property} value={property} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="field-json-path" className="mb-1 block text-xs text-text-muted">
                JSON Path <span className="text-text-muted">(elle de düzenleyebilirsin)</span>
              </label>
              <input
                id="field-json-path"
                type="text"
                value={draft.jsonPath}
                onChange={(event) => updateJsonPath(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-text"
              />
              {jsonPathError && <p className="mt-1 text-xs text-red-500">{jsonPathError}</p>}
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Çıktı Önizlemesi</p>
              <pre className="max-h-32 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-xs text-text">
                {jsonPathError ? "—" : JSON.stringify(buildFieldOutputPreview(draft), null, 2)}
              </pre>
            </div>
          </div>

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
                        setDraft((prev) => ({ ...prev, condition: { fieldKey, equals: source?.options[0]?.value ?? "" } }));
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
                          <option key={option.value} value={option.value}>
                            {option.label}
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
              const isOn = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange(isOn ? selected.filter((v) => v !== option.value) : [...selected, option.value])}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    isOn ? "border-primary bg-primary text-primary-foreground" : "border-border text-text-muted",
                  )}
                >
                  {option.label}
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
            <option key={option.value} value={option.value}>
              {option.label}
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
