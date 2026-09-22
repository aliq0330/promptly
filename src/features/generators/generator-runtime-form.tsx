"use client";

import { useMemo } from "react";
import { isFieldVisible } from "@/lib/generator-template";
import { GeneratorRuntimeField } from "./generator-runtime-field";
import type { GeneratorSchema, GeneratorValues } from "@/types";

/**
 * Renders a real schema's fields, in order, skipping any field whose one
 * optional condition (§34) isn't currently satisfied. A flat list — the
 * field-organization category system was removed (it was non-functional in
 * practice, per an explicit user report; see CLAUDE.md). The single shared
 * "form view" both the builder's Live Preview and the real generator runtime
 * page render — see generator-runtime-field.tsx's own note on why this is
 * one component, not two.
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
  const fields = useMemo(
    () => [...schema.fields].sort((a, b) => a.order - b.order).filter((field) => isFieldVisible(field, values)),
    [schema, values],
  );

  if (schema.fields.length === 0) {
    return <p className="text-sm text-text-muted">Bu generatorda henüz hiç alan yok.</p>;
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <GeneratorRuntimeField key={field.id} field={field} values={values} onChange={onChange} />
      ))}
    </div>
  );
}
