"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/language-provider";
import { defaultValuesFromSchema, makeFieldKeyFromLabel } from "@/lib/generator-template";
import type { StudioSnapshot } from "@/lib/studio-diff";
import type { GeneratorField, GeneratorSchema, GeneratorValues } from "@/types";
import { FieldEditorModal } from "@/features/generators/field-editor-modal";
import { FieldList } from "@/features/generators/field-list";
import { GeneratorRuntimeForm } from "@/features/generators/generator-runtime-form";

type Update = (fn: (draft: StudioSnapshot) => StudioSnapshot, key?: string | null) => void;

/** Keeps each field's current value, adds defaults for new fields and drops values of removed ones. */
function syncValues(schema: GeneratorSchema, values: GeneratorValues): GeneratorValues {
  const defaults = defaultValuesFromSchema(schema);
  const out: GeneratorValues = {};
  for (const field of schema.fields) out[field.key] = values[field.key] ?? defaults[field.key];
  return out;
}

/** Generator values + schema editing in the Studio draft, using the real runtime form and the builder's own field list/editor. */
export function GeneratorPane({ draft, edit }: { draft: StudioSnapshot; edit: Update }) {
  const { t } = useTranslation();
  const generator = draft.generator;
  const [tab, setTab] = useState<"values" | "fields">("values");
  const [editing, setEditing] = useState<{ field: GeneratorField | null; isNew: boolean } | null>(null);
  if (!generator) return null;
  const fields = generator.schema.fields;

  function updateSchema(next: GeneratorSchema, key: string | null = null) {
    edit((d) => (d.generator ? { ...d, generator: { ...d.generator, schema: next, values: syncValues(next, d.generator.values) } } : d), key);
  }

  function saveField(field: GeneratorField) {
    const exists = fields.some((f) => f.id === field.id);
    const nextFields = exists ? fields.map((f) => (f.id === field.id ? field : f)) : [...fields, { ...field, order: fields.length > 0 ? Math.max(...fields.map((f) => f.order)) + 1 : 0 }];
    updateSchema({ ...generator!.schema, fields: nextFields });
    setEditing(null);
  }

  function duplicateField(field: GeneratorField) {
    const key = makeFieldKeyFromLabel(`${field.label || field.key}-copy`, fields.map((f) => f.key));
    const copy: GeneratorField = {
      ...field,
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      key,
      jsonPath: key,
      label: `${field.label} ${t("studio.copySuffix")}`,
      order: Math.max(...fields.map((f) => f.order)) + 1,
    };
    updateSchema({ ...generator!.schema, fields: [...fields, copy] });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="studio-generator-title" className="mb-1.5 block text-small font-medium text-text">
          {t("studio.generatorTitle")}
        </label>
        <input
          id="studio-generator-title"
          value={generator.title}
          onChange={(event) => edit((d) => (d.generator ? { ...d, generator: { ...d.generator, title: event.target.value } } : d), "generator-title")}
          className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 text-body text-text focus:border-primary"
        />
      </div>
      <Tabs
        items={[
          { key: "values" as const, label: t("studio.generatorValues") },
          { key: "fields" as const, label: t("studio.generatorFields"), count: fields.length },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel={t("studio.kind.generator")}
        variant="segmented"
      />
      {tab === "values" ? (
        <GeneratorRuntimeForm
          schema={generator.schema}
          values={generator.values}
          onChange={(key, value) => edit((d) => (d.generator ? { ...d, generator: { ...d.generator, values: { ...d.generator.values, [key]: value } } } : d), `gen-${key}`)}
        />
      ) : (
        <FieldList
          fields={fields}
          onAddField={() => setEditing({ field: null, isNew: true })}
          onEditField={(field) => setEditing({ field, isNew: false })}
          onDuplicateField={duplicateField}
          onDeleteField={(fieldId) => updateSchema({ ...generator.schema, fields: fields.filter((f) => f.id !== fieldId) })}
          onReorderFields={(ids) => updateSchema({ ...generator.schema, fields: ids.map((id, order) => ({ ...fields.find((f) => f.id === id)!, order })) })}
        />
      )}
      {editing && (
        <FieldEditorModal
          initial={editing.field}
          isNew={editing.isNew}
          allFields={fields}
          onClose={() => setEditing(null)}
          onSave={saveField}
          onDelete={editing.field ? () => {
            updateSchema({ ...generator.schema, fields: fields.filter((f) => f.id !== editing.field!.id) });
            setEditing(null);
          } : undefined}
        />
      )}
    </div>
  );
}
