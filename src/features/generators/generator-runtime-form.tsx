"use client";

import { useMemo } from "react";
import { Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFieldVisible } from "@/lib/generator-template";
import { useTranslation } from "@/lib/i18n/language-provider";
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
  lockedKeys,
  onToggleLock,
}: {
  schema: GeneratorSchema;
  values: GeneratorValues;
  onChange: (key: string, value: string | string[]) => void;
  /** Studio only: fields whose value variations must not change. Omit both to render the plain form. */
  lockedKeys?: readonly string[];
  onToggleLock?: (key: string) => void;
}) {
  const { t } = useTranslation();
  const fields = useMemo(
    () => [...schema.fields].sort((a, b) => a.order - b.order).filter((field) => isFieldVisible(field, values)),
    [schema, values],
  );

  if (schema.fields.length === 0) {
    return <p className="text-sm text-text-muted">{t("generator.noFieldsYet")}</p>;
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        if (!onToggleLock) return <GeneratorRuntimeField key={field.id} field={field} values={values} onChange={onChange} />;
        const locked = lockedKeys?.includes(field.key) ?? false;
        return (
          <div key={field.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <GeneratorRuntimeField field={field} values={values} onChange={onChange} />
            </div>
            <button
              type="button"
              onClick={() => onToggleLock(field.key)}
              aria-pressed={locked}
              aria-label={`${locked ? t("studio.unlockField") : t("studio.lockField")}: ${field.label}`}
              title={locked ? t("studio.unlockField") : t("studio.lockField")}
              className={cn(
                "mt-6 flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                locked ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text-muted hover:bg-surface-soft",
              )}
            >
              {locked ? <Lock className="h-4 w-4" aria-hidden /> : <LockOpen className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
