"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { PromptVariable } from "@/types";
import { VariableField } from "./variable-field";

/**
 * Inline variable fields shown directly above a prompt's text on the detail
 * page. The parent owns the values and renders the resolved prompt below, so
 * typing here updates the prompt text live — purely local, throwaway state
 * (the stored template is never touched). Each variable renders the control
 * for its own kind (text / choice / number / slider / toggle).
 */
export function PromptVariableInputs({
  variables,
  values,
  visible,
  isCustomized,
  onChange,
  onReset,
  className,
}: {
  variables: PromptVariable[];
  /** Effective value per variable name (defaults already merged in). */
  values: Record<string, string>;
  /** Which variables currently pass their visibility condition (`effectiveVariableValues`); a missing entry means visible. */
  visible?: Record<string, boolean>;
  isCustomized: boolean;
  onChange: (name: string, value: string) => void;
  onReset: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <section className={cn("space-y-3 rounded-lg border border-border-soft bg-surface px-4 py-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
          {t("variable.sectionHeading", { count: variables.length })}
        </h3>
        {isCustomized && (
          <button type="button" onClick={onReset} className="text-caption font-medium text-primary hover:underline">
            {t("prompt.resetToDefaults")}
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {variables.filter((variable) => visible?.[variable.name] !== false).map((variable) => (
          <VariableField
            key={variable.id}
            variable={variable}
            value={values[variable.name] ?? ""}
            onChange={(value) => onChange(variable.name, value)}
          />
        ))}
      </div>
    </section>
  );
}
