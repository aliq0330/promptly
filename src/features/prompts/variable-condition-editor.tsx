"use client";

import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  conditionChoices,
  defaultConditionEquals,
  isChoiceType,
  type ConditionError,
  type ConditionalVariable,
} from "@/lib/prompt-variable-types";
import type { PromptVariableCondition } from "@/types";

const ERROR_KEYS: Record<Exclude<ConditionError, null>, TranslationKey> = {
  conditionMissing: "variable.error.conditionMissing",
  conditionValueEmpty: "variable.error.conditionValueEmpty",
};

/**
 * "Show only when…" editor (CLAUDE.md §9.145, 1c). One optional condition per
 * variable: pick an EARLIER variable and the value it must have. The list of
 * `controllers` is already limited to earlier variables by the caller, which
 * is what keeps dependencies from ever looping.
 */
export function VariableConditionEditor({
  condition,
  controllers,
  onChange,
  error,
  idPrefix,
}: {
  condition: PromptVariableCondition | undefined;
  controllers: ConditionalVariable[];
  onChange: (condition: PromptVariableCondition | undefined) => void;
  error?: ConditionError;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const enabled = condition !== undefined;
  const controller = condition ? controllers.find((item) => item.name === condition.variable) : undefined;
  const choices = controller ? conditionChoices(controller) : null;

  function toggle(on: boolean) {
    if (!on) return onChange(undefined);
    const first = controllers[0];
    if (first) onChange({ variable: first.name, equals: defaultConditionEquals(first) });
  }

  function selectController(name: string) {
    const next = controllers.find((item) => item.name === name);
    if (next) onChange({ variable: next.name, equals: defaultConditionEquals(next) });
  }

  const noControllers = controllers.length === 0;

  return (
    <div className="space-y-3 rounded-lg border border-border-soft bg-surface-soft/50 p-3">
      <label className={cn("flex items-start gap-2 text-label font-medium text-text", noControllers && !enabled && "opacity-60")}>
        <input
          type="checkbox"
          id={`${idPrefix}-cond-enabled`}
          checked={enabled}
          disabled={noControllers && !enabled}
          onChange={(event) => toggle(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          {t("variable.conditionToggle")}
          <span className="block font-normal text-caption text-text-muted">
            {noControllers && !enabled ? t("variable.conditionNeedsEarlier") : t("variable.conditionHint")}
          </span>
        </span>
      </label>

      {enabled && condition && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-cond-var`} className={fieldLabelClassName}>
              {t("variable.conditionWhen")}
            </label>
            <select
              id={`${idPrefix}-cond-var`}
              value={condition.variable}
              onChange={(event) => selectController(event.target.value)}
              className={cn(fieldControlClassName, "h-10")}
            >
              {!controller && <option value={condition.variable}>{condition.variable}</option>}
              {controllers.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-cond-equals`} className={fieldLabelClassName}>
              {controller && controller.type === "multi_select" ? t("variable.conditionIncludes") : t("variable.conditionEquals")}
            </label>
            {controller && choices ? (
              <select
                id={`${idPrefix}-cond-equals`}
                value={condition.equals}
                onChange={(event) => onChange({ ...condition, equals: event.target.value })}
                className={cn(fieldControlClassName, "h-10")}
              >
                {!choices.includes(condition.equals) && <option value={condition.equals}>{condition.equals || "—"}</option>}
                {isChoiceType(controller.type)
                  ? controller.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  : [
                      <option key="on" value={controller.config.onText ?? ""}>
                        {t("variable.conditionToggleOn", { text: controller.config.onText ?? "" })}
                      </option>,
                      <option key="off" value={controller.config.offText ?? ""}>
                        {controller.config.offText
                          ? t("variable.conditionToggleOff", { text: controller.config.offText })
                          : t("variable.conditionToggleOffEmpty")}
                      </option>,
                    ]}
              </select>
            ) : (
              <input
                id={`${idPrefix}-cond-equals`}
                type="text"
                value={condition.equals}
                onChange={(event) => onChange({ ...condition, equals: event.target.value })}
                className={cn(fieldControlClassName, "h-10")}
              />
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {t(ERROR_KEYS[error])}
        </p>
      )}
    </div>
  );
}
