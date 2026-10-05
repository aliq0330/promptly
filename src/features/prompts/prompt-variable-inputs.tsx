"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import { CopyPromptButton } from "./copy-prompt-button";
import type { PromptVariable } from "@/types";

/**
 * Inline variable fields shown directly above a prompt's text on the detail
 * page. The parent owns the values and renders the resolved prompt below, so
 * typing here updates the prompt text live — purely local, throwaway state
 * (the stored template is never touched).
 */
export function PromptVariableInputs({
  variables,
  values,
  template,
  isCustomized,
  onChange,
  onReset,
}: {
  variables: PromptVariable[];
  /** Effective value per variable name (defaults already merged in). */
  values: Record<string, string>;
  /** The raw `{token}` template, offered for copying unresolved. */
  template: string;
  isCustomized: boolean;
  onChange: (name: string, value: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3 border-b border-border-soft bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
          {t("variable.sectionHeading", { count: variables.length })}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {isCustomized && (
            <button type="button" onClick={onReset} className="text-caption font-medium text-primary hover:underline">
              {t("prompt.resetToDefaults")}
            </button>
          )}
          <CopyPromptButton text={template} label={t("prompt.copyTemplate")} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {variables.map((variable) => (
          <div key={variable.id} className="min-w-0">
            <label htmlFor={`pv-${variable.id}`} className="mb-1 block truncate text-caption font-medium text-text-secondary">
              {variable.name}
              {variable.description && <span className="ml-1.5 font-normal text-text-muted">— {variable.description}</span>}
            </label>
            <input
              id={`pv-${variable.id}`}
              type="text"
              value={values[variable.name] ?? ""}
              onChange={(event) => onChange(variable.name, event.target.value)}
              placeholder={variable.defaultValue || t("prompt.enterValue")}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-body text-text placeholder:text-text-muted focus:border-primary"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
