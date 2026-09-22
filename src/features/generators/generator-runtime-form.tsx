"use client";

import { useMemo } from "react";
import { isFieldVisible } from "@/lib/generator-template";
import { GeneratorRuntimeField } from "./generator-runtime-field";
import type { GeneratorSchema, GeneratorValues } from "@/types";

/**
 * Renders a real schema's categories/fields grouped and in order, skipping
 * any field whose one optional condition (§34) isn't currently satisfied.
 * The single shared "form view" both the builder's Live Preview and the
 * real generator runtime page render — see generator-runtime-field.tsx's
 * own note on why this is one component, not two.
 */
export function GeneratorRuntimeForm({
  schema,
  values,
  onChange,
}: {
  schema: GeneratorSchema;
  values: GeneratorValues;
  onChange: (key: string, value: string | string[]) => void;
}) {
  const sortedCategories = useMemo(() => [...schema.categories].sort((a, b) => a.order - b.order), [schema.categories]);
  const uncategorized = useMemo(() => schema.fields.filter((field) => !schema.categories.some((c) => c.id === field.categoryId)), [schema]);

  if (schema.fields.length === 0) {
    return <p className="text-sm text-text-muted">Bu generatorda henüz hiç alan yok.</p>;
  }

  return (
    <div className="space-y-5">
      {sortedCategories.map((category) => {
        const fields = schema.fields.filter((field) => field.categoryId === category.id && isFieldVisible(field, values)).sort((a, b) => a.order - b.order);
        if (fields.length === 0) return null;
        return (
          <div key={category.id} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{category.name}</p>
            <div className="space-y-3">
              {fields.map((field) => (
                <GeneratorRuntimeField key={field.id} field={field} values={values} onChange={onChange} />
              ))}
            </div>
          </div>
        );
      })}
      {uncategorized.filter((field) => isFieldVisible(field, values)).length > 0 && (
        <div className="space-y-3">
          {sortedCategories.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Diğer</p>}
          <div className="space-y-3">
            {uncategorized
              .filter((field) => isFieldVisible(field, values))
              .map((field) => (
                <GeneratorRuntimeField key={field.id} field={field} values={values} onChange={onChange} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
