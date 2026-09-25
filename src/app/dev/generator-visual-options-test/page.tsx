"use client";

/**
 * Temporary, dev-only test harness for "Generator Hazır Alanları +
 * Varsayılan Görsel Seçenekleri" (CLAUDE.md) — same idea as
 * `/dev/share-modal-test` (Bölüm 9.52) / `/dev/image-analysis-test` (Bölüm
 * 9.47): renders the real, unmodified `GeneratorRuntimeForm`/
 * `GeneratorRuntimeField`/`FieldEditorModal` against a hand-built schema so
 * the image-card grid, color swatches, and old-generator (no visuals)
 * fallback can all be exercised in one place, and so the real JSON Output
 * Engine (`buildGeneratorOutput`) can be checked live to prove images/
 * colors never leak into the generated output — never used, and never
 * linked, in the real app; safe to delete once verified, same as its
 * precedents.
 */
import { useState } from "react";
import { GeneratorRuntimeForm } from "@/features/generators/generator-runtime-form";
import { GeneratorRuntimeField } from "@/features/generators/generator-runtime-field";
import { FieldEditorModal } from "@/features/generators/field-editor-modal";
import { FieldCatalogPicker } from "@/features/generators/field-catalog-picker";
import type { CatalogField } from "@/lib/generator-field-catalog";
import { makeFieldKeyFromLabel } from "@/lib/generator-template";
import { buildGeneratorOutput } from "@/lib/generator-output";
import { placeholderArt } from "@/lib/placeholder-image";
import type { GeneratorField, GeneratorSchema, GeneratorValues } from "@/types";

/** The exact same conversion `generator-builder.tsx`'s `insertFieldDescriptors` does — reproduced here (not imported, it's a closure inside that component) so this harness exercises the real end-to-end catalog→schema→runtime path with the catalog's own, non-synthetic default images/colors. */
function catalogFieldToGeneratorField(field: CatalogField, existingKeys: string[]): GeneratorField {
  const key = makeFieldKeyFromLabel(field.label, existingKeys);
  return {
    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    label: field.label,
    description: "",
    type: field.type,
    required: false,
    options: field.options,
    defaultValue: field.type === "multi_select" ? [] : "",
    placeholder: field.placeholder ?? "",
    min: field.min ?? null,
    max: field.max ?? null,
    step: field.step ?? null,
    order: 0,
    condition: null,
    jsonPath: field.jsonPath?.trim() || key,
  };
}

const IMAGE_FIELD: GeneratorField = {
  id: "f-hair-style",
  key: "hair_style",
  label: "Saç Şekli",
  description: "",
  type: "select",
  required: false,
  options: ["Düz", "Dalgalı", "Kıvırcık", "Topuz"].map((label) => ({
    label,
    value: label.toLowerCase(),
    image: placeholderArt(`hair_style:${label}`, 160, 160),
  })),
  defaultValue: "",
  placeholder: "",
  min: null,
  max: null,
  step: null,
  order: 0,
  condition: null,
  jsonPath: "hair.style",
};

const MULTI_IMAGE_FIELD: GeneratorField = {
  ...IMAGE_FIELD,
  id: "f-accessories",
  key: "accessories",
  label: "Aksesuarlar",
  type: "multi_select",
  jsonPath: "accessories",
  options: ["Şapka", "Gözlük", "Kolye"].map((label) => ({
    label,
    value: label.toLowerCase(),
    image: placeholderArt(`accessory:${label}`, 160, 160),
  })),
};

const COLOR_FIELD: GeneratorField = {
  id: "f-hair-color",
  key: "hair_color",
  label: "Saç Rengi",
  description: "",
  type: "select",
  required: false,
  options: [
    { label: "Siyah", value: "siyah", color: "#1C1310" },
    { label: "Kahverengi", value: "kahverengi", color: "#5A3825" },
    { label: "Sarı", value: "sari", color: "#D6B56A" },
  ],
  defaultValue: "",
  placeholder: "",
  min: null,
  max: null,
  step: null,
  order: 1,
  condition: null,
  jsonPath: "hair.color",
};

/** No image/color at all — an "old generator" field, must render exactly the plain native <select> it always has. */
const PLAIN_FIELD: GeneratorField = {
  id: "f-plain",
  key: "gender",
  label: "Cinsiyet (eski, görselsiz alan)",
  description: "",
  type: "select",
  required: false,
  options: [
    { label: "Kadın", value: "kadin" },
    { label: "Erkek", value: "erkek" },
  ],
  defaultValue: "",
  placeholder: "",
  min: null,
  max: null,
  step: null,
  order: 2,
  condition: null,
  jsonPath: "gender",
};

const SCHEMA: GeneratorSchema = { fields: [IMAGE_FIELD, MULTI_IMAGE_FIELD, COLOR_FIELD, PLAIN_FIELD] };

export default function GeneratorVisualOptionsTestPage() {
  const [values, setValues] = useState<GeneratorValues>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editedField, setEditedField] = useState<GeneratorField>(IMAGE_FIELD);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [insertedField, setInsertedField] = useState<GeneratorField | null>(null);
  const [insertedValues, setInsertedValues] = useState<GeneratorValues>({});

  const output = buildGeneratorOutput(SCHEMA, values, "", "", false);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-xl font-semibold text-text">Generator visual options — test harness</h1>

      <section data-testid="runtime-form" className="space-y-4 rounded-lg border border-border p-4">
        <GeneratorRuntimeForm schema={SCHEMA} values={values} onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))} />
      </section>

      <section data-testid="json-output" className="rounded-lg border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold text-text">JSON Output (buildGeneratorOutput)</h2>
        <pre className="overflow-auto rounded-md bg-background p-2 text-xs text-text">{JSON.stringify(output, null, 2)}</pre>
      </section>

      <section data-testid="field-editor-section" className="rounded-lg border border-border p-4">
        <button
          type="button"
          onClick={() => {
            setEditedField(IMAGE_FIELD);
            setEditorOpen(true);
          }}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text"
        >
          Edit &quot;Saç Şekli&quot; field
        </button>
        <button
          type="button"
          onClick={() => {
            setEditedField(COLOR_FIELD);
            setEditorOpen(true);
          }}
          className="ml-2 rounded-md border border-border px-3 py-1.5 text-sm text-text"
        >
          Edit &quot;Saç Rengi&quot; field
        </button>
      </section>

      {editorOpen && (
        <FieldEditorModal
          initial={editedField}
          isNew={false}
          allFields={SCHEMA.fields}
          onClose={() => setEditorOpen(false)}
          onSave={() => setEditorOpen(false)}
          onDelete={() => setEditorOpen(false)}
        />
      )}

      {/* End-to-end catalog → schema → runtime path, with the CATALOG's own (non-synthetic) default images/colors — the real "Hazır Alan Ekle" flow generator-builder.tsx wires up. */}
      <section data-testid="catalog-picker-section" className="rounded-lg border border-border p-4">
        <button type="button" onClick={() => setPickerOpen(true)} className="rounded-md border border-border px-3 py-1.5 text-sm text-text">
          Hazır Alan Ekle (open catalog picker)
        </button>
        {insertedField && (
          <div data-testid="inserted-field" className="mt-4 space-y-2">
            <p className="text-xs text-text-muted">Inserted from catalog: {insertedField.label}</p>
            <GeneratorRuntimeField field={insertedField} values={insertedValues} onChange={(key, value) => setInsertedValues((prev) => ({ ...prev, [key]: value }))} />
          </div>
        )}
      </section>

      {pickerOpen && (
        <FieldCatalogPicker
          existingFields={SCHEMA.fields}
          onClose={() => setPickerOpen(false)}
          onInsert={(fields) => {
            const [first] = fields;
            if (first) setInsertedField(catalogFieldToGeneratorField(first, SCHEMA.fields.map((f) => f.key)));
            setPickerOpen(false);
          }}
          onCreateCustom={() => setPickerOpen(false)}
        />
      )}
    </main>
  );
}
