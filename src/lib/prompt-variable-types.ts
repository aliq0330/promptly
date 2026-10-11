/**
 * Pure, framework-free helpers for typed prompt variables (CLAUDE.md §9.145).
 * The `{name}` token engine in `prompt-variables.ts` is deliberately left
 * untouched: whatever the variable's kind, what gets substituted into the
 * prompt is a plain string, so every kind only needs (a) a way to normalize
 * its spec, (b) a way to keep its default valid and (c) a way to turn the
 * viewer's interaction (chip tap, switch, slider…) into that string.
 */
import type {
  PromptVariableCondition,
  PromptVariableConfig,
  PromptVariableOption,
  PromptVariableSpec,
  PromptVariableType,
} from "@/types";

export const VARIABLE_TYPES: PromptVariableType[] = ["text", "select", "multi_select", "number", "slider", "toggle"];

/** Separator used between the values of a multi-select in the prompt text. */
export const MULTI_SEPARATOR = ", ";

export const MAX_OPTIONS = 50;
export const MAX_OPTION_LENGTH = 80;
/** Option thumbnails are stored inline (data URL) in `options` JSON, so each is capped. */
export const MAX_OPTION_IMAGE_LENGTH = 60_000;
/** Longest edge, in px, an uploaded option image is shrunk to. */
export const OPTION_IMAGE_MAX_DIMENSION = 200;

const DEFAULT_RANGE = { min: 0, max: 100, step: 1 } as const;

export function isChoiceType(type: PromptVariableType): boolean {
  return type === "select" || type === "multi_select";
}

export function isNumericType(type: PromptVariableType): boolean {
  return type === "number" || type === "slider";
}

/** A fresh spec for `type`. */
export function emptySpec(type: PromptVariableType = "text"): PromptVariableSpec {
  return { type, options: [], config: defaultConfigFor(type) };
}

export function defaultConfigFor(type: PromptVariableType): PromptVariableConfig {
  if (isNumericType(type)) return { ...DEFAULT_RANGE };
  if (type === "toggle") return { onText: "", offText: "" };
  return {};
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** `min`/`max`/`step` of a numeric variable with safe fallbacks (max ≥ min, step > 0). */
export function numericRange(config: PromptVariableConfig): { min: number; max: number; step: number } {
  const min = finiteOr(config.min, DEFAULT_RANGE.min);
  const max = Math.max(min, finiteOr(config.max, DEFAULT_RANGE.max));
  const rawStep = finiteOr(config.step, DEFAULT_RANGE.step);
  return { min, max, step: rawStep > 0 ? rawStep : DEFAULT_RANGE.step };
}

/** Clamps `n` into the range and snaps it to the nearest step from `min`. */
export function clampToRange(n: number, config: PromptVariableConfig): number {
  const { min, max, step } = numericRange(config);
  const clamped = Math.min(max, Math.max(min, n));
  const snapped = min + Math.round((clamped - min) / step) * step;
  // Avoid float noise like 0.30000000000000004 and stay inside the range.
  const rounded = Number(Math.min(max, snapped).toFixed(6));
  return rounded;
}

export function isValidOptionColor(color: unknown): color is string {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);
}

export function isValidOptionImage(image: unknown): image is string {
  return typeof image === "string" && image.startsWith("data:image/") && image.length <= MAX_OPTION_IMAGE_LENGTH;
}

/** Keeps a valid `image` (which wins) or a valid `color`, never both and never invalid data. */
function visualOf(option: { image?: unknown; color?: unknown }): { image?: string; color?: string } {
  if (isValidOptionImage(option.image)) return { image: option.image };
  if (isValidOptionColor(option.color)) return { color: option.color };
  return {};
}

/** True when the list is non-empty and EVERY option has a thumbnail — only then is it shown as image cards. */
export function allOptionsHaveImage(options: PromptVariableOption[]): boolean {
  return options.length > 0 && options.every((option) => Boolean(option.image));
}

/** True when the list is non-empty and EVERY option has a color — only then is it shown as color swatches. */
export function allOptionsHaveColor(options: PromptVariableOption[]): boolean {
  return options.length > 0 && options.every((option) => Boolean(option.color));
}

/** Drops blank options, trims, fills a blank `value` from `label`, removes duplicate values, validates image/color and caps the list. */
export function sanitizeOptions(options: PromptVariableOption[]): PromptVariableOption[] {
  const seen = new Set<string>();
  const out: PromptVariableOption[] = [];
  for (const option of options) {
    const label = option.label.trim().slice(0, MAX_OPTION_LENGTH);
    if (!label) continue;
    const value = (option.value.trim() || label).slice(0, MAX_OPTION_LENGTH).replace(/,/g, "");
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ label, value, ...visualOf(option) });
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
}

/** Splits a stored multi-select string back into its option values (order of appearance, no blanks). */
export function parseMultiValue(current: string): string[] {
  return current
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Toggles one option in a multi-select; the result always follows the option list order, never the click order. */
export function toggleMultiValue(current: string, optionValue: string, options: PromptVariableOption[]): string {
  const selected = new Set(parseMultiValue(current));
  if (selected.has(optionValue)) selected.delete(optionValue);
  else selected.add(optionValue);
  return options
    .filter((option) => selected.has(option.value))
    .map((option) => option.value)
    .join(MULTI_SEPARATOR);
}

/** True when a toggle variable's current value is its "on" text. */
export function isToggleOn(current: string, config: PromptVariableConfig): boolean {
  return current === (config.onText ?? "");
}

/** The prompt string a toggle contributes for the given state. */
export function toggleValue(on: boolean, config: PromptVariableConfig): string {
  return on ? (config.onText ?? "") : (config.offText ?? "");
}

/**
 * Returns the spec cleaned for its type — options sanitized (and cleared for
 * non-choice kinds), numeric range made valid, toggle texts defined — plus a
 * `defaultValue` that is guaranteed valid for that spec. Used whenever the
 * user changes the type or any of its settings and right before saving, so the
 * stored row can never contradict its own kind.
 */
export function normalizeVariable(
  spec: PromptVariableSpec,
  defaultValue: string,
): { spec: PromptVariableSpec; defaultValue: string } {
  const result = normalizeCore(spec, defaultValue);
  const condition = parseStoredCondition(spec.config.condition);
  return condition ? { ...result, spec: { ...result.spec, config: { ...result.spec.config, condition } } } : result;
}

function normalizeCore(
  spec: PromptVariableSpec,
  defaultValue: string,
): { spec: PromptVariableSpec; defaultValue: string } {
  const { type } = spec;
  if (isChoiceType(type)) {
    const options = sanitizeOptions(spec.options);
    const values = new Set(options.map((option) => option.value));
    let next = defaultValue;
    if (type === "select") {
      if (!values.has(next)) next = options[0]?.value ?? "";
    } else {
      next = options
        .filter((option) => parseMultiValue(defaultValue).includes(option.value))
        .map((option) => option.value)
        .join(MULTI_SEPARATOR);
    }
    return { spec: { type, options, config: {} }, defaultValue: next };
  }
  if (isNumericType(type)) {
    const range = numericRange(spec.config);
    const parsed = Number(defaultValue);
    const next = defaultValue.trim() !== "" && Number.isFinite(parsed) ? clampToRange(parsed, range) : range.min;
    return { spec: { type, options: [], config: range }, defaultValue: String(next) };
  }
  if (type === "toggle") {
    const onText = (spec.config.onText ?? "").trim();
    const offText = (spec.config.offText ?? "").trim();
    const config = { onText, offText };
    return { spec: { type, options: [], config }, defaultValue: defaultValue === onText ? onText : offText };
  }
  return { spec: { type: "text", options: [], config: {} }, defaultValue };
}

export type VariableSpecError =
  | "optionsTooFew"
  | "rangeInvalid"
  | "toggleOnEmpty"
  | "toggleSame"
  | null;

/** Validation of a (not yet normalized) spec — the error keys map to `variable.error.*` translations. */
export function validateSpec(spec: PromptVariableSpec): VariableSpecError {
  if (isChoiceType(spec.type)) {
    return sanitizeOptions(spec.options).length >= 2 ? null : "optionsTooFew";
  }
  if (isNumericType(spec.type)) {
    const min = spec.config.min;
    const max = spec.config.max;
    if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return "rangeInvalid";
    }
    return null;
  }
  if (spec.type === "toggle") {
    const onText = (spec.config.onText ?? "").trim();
    const offText = (spec.config.offText ?? "").trim();
    if (!onText) return "toggleOnEmpty";
    if (onText === offText) return "toggleSame";
  }
  return null;
}

/** Safely reads a stored `options` JSON value (anything unexpected → empty list). */
export function parseStoredOptions(raw: unknown): PromptVariableOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PromptVariableOption[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const { label, value, image, color } = item as { label?: unknown; value?: unknown; image?: unknown; color?: unknown };
      if (typeof label === "string" && typeof value === "string") out.push({ label, value, ...visualOf({ image, color }) });
    }
  }
  return out;
}

/** Safely reads a stored `config` JSON value. */
export function parseStoredConfig(raw: unknown): PromptVariableConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const config: PromptVariableConfig = {};
  for (const key of ["min", "max", "step"] as const) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) config[key] = value;
  }
  for (const key of ["onText", "offText"] as const) {
    const value = source[key];
    if (typeof value === "string") config[key] = value;
  }
  const condition = parseStoredCondition(source.condition);
  if (condition) config.condition = condition;
  return config;
}

/** Safely reads a stored visibility condition (anything unexpected → none). */
export function parseStoredCondition(raw: unknown): PromptVariableCondition | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const { variable, equals } = raw as { variable?: unknown; equals?: unknown };
  if (typeof variable !== "string" || variable === "" || typeof equals !== "string") return undefined;
  return { variable, equals };
}

export function parseStoredType(raw: unknown): PromptVariableType {
  return VARIABLE_TYPES.includes(raw as PromptVariableType) ? (raw as PromptVariableType) : "text";
}

/** Human-readable summary of what a variable offers (for lists / picker rows), e.g. "Seçenekli: Güneşli, Yağmurlu". */
export function describeOptions(options: PromptVariableOption[], limit = 3): string {
  const labels = options.slice(0, limit).map((option) => option.label);
  return options.length > limit ? `${labels.join(", ")} +${options.length - limit}` : labels.join(", ");
}

/**
 * Converts a variable being edited to another kind, carrying over what makes
 * sense so switching in the editor never feels destructive:
 *  - text → choice: the current default (or the text the user selected in the
 *    prompt) becomes the first option, plus an empty second row to fill in;
 *  - choice → choice: options kept;
 *  - → numeric: the old default is reused when it is a number;
 *  - → toggle: the old default text becomes the "on" text;
 *  - → text: a choice's default value is kept as the text.
 * The result is NOT normalized/validated — it is editor state, blank option
 * rows included; `normalizeVariable` runs when the form is submitted.
 */
export function convertSpec(
  from: { spec: PromptVariableSpec; defaultValue: string },
  to: PromptVariableType,
  seedText = "",
): { spec: PromptVariableSpec; defaultValue: string } {
  if (from.spec.type === to) return from;
  const result = convertCore(from, to, seedText);
  // The visibility condition is independent of the kind, so it survives a kind change.
  const condition = from.spec.config.condition;
  return condition ? { ...result, spec: { ...result.spec, config: { ...result.spec.config, condition } } } : result;
}

function convertCore(
  from: { spec: PromptVariableSpec; defaultValue: string },
  to: PromptVariableType,
  seedText: string,
): { spec: PromptVariableSpec; defaultValue: string } {
  const seed = (seedText || from.defaultValue).trim();

  if (isChoiceType(to)) {
    if (isChoiceType(from.spec.type)) {
      return { spec: { type: to, options: from.spec.options, config: {} }, defaultValue: to === "select" ? parseMultiValue(from.defaultValue)[0] ?? "" : from.defaultValue };
    }
    const first = seed ? [{ label: seed, value: seed }] : [];
    return {
      spec: { type: to, options: [...first, { label: "", value: "" }, ...(first.length ? [] : [{ label: "", value: "" }])], config: {} },
      defaultValue: seed.replace(/,/g, ""),
    };
  }

  if (isNumericType(to)) {
    const config = isNumericType(from.spec.type) ? from.spec.config : defaultConfigFor(to);
    const parsed = Number(from.defaultValue);
    const keep = from.defaultValue.trim() !== "" && Number.isFinite(parsed);
    return { spec: { type: to, options: [], config }, defaultValue: keep ? from.defaultValue : String(numericRange(config).min) };
  }

  if (to === "toggle") {
    const onText = seed;
    return { spec: { type: to, options: [], config: { onText, offText: "" } }, defaultValue: "" };
  }

  return { spec: { type: "text", options: [], config: {} }, defaultValue: from.defaultValue };
}

// ---------------------------------------------------------------------------
// Visibility conditions (§9.145, 1c)
// ---------------------------------------------------------------------------

/** The slice of a variable the condition logic needs — satisfied by both stored and draft variables. */
export interface ConditionalVariable extends PromptVariableSpec {
  name: string;
  defaultValue: string;
}

/** True when `condition` holds for the controlling variable's current value. */
export function conditionMatches(
  condition: PromptVariableCondition,
  controllerType: PromptVariableType,
  controllerValue: string,
): boolean {
  if (controllerType === "multi_select") return parseMultiValue(controllerValue).includes(condition.equals);
  return controllerValue === condition.equals;
}

/** The values a condition on `controller` can meaningfully compare against, or `null` for free-form controllers. */
export function conditionChoices(controller: ConditionalVariable): string[] | null {
  if (isChoiceType(controller.type)) return controller.options.map((option) => option.value);
  if (controller.type === "toggle") return [controller.config.onText ?? "", controller.config.offText ?? ""];
  return null;
}

/** The `equals` a freshly chosen controller starts with. */
export function defaultConditionEquals(controller: ConditionalVariable): string {
  const choices = conditionChoices(controller);
  return choices ? (choices[0] ?? "") : "";
}

export type ConditionStatus = "none" | "ok" | "missing" | "notEarlier" | "stale";

/**
 * Whether `variable`'s condition still points at something real. `missing` =
 * the controlling variable no longer exists, `notEarlier` = it isn't before
 * this variable in the list, `stale` = the compared value is no longer one of
 * the controller's choices. A condition that isn't `ok` is IGNORED (the
 * variable stays visible) so content can never vanish for good.
 */
export function conditionStatus(variable: ConditionalVariable, variables: ConditionalVariable[]): ConditionStatus {
  const condition = variable.config.condition;
  if (!condition) return "none";
  const index = variables.findIndex((item) => item.name === variable.name);
  const controllerIndex = variables.findIndex((item) => item.name === condition.variable);
  if (controllerIndex === -1) return "missing";
  if (index !== -1 && controllerIndex >= index) return "notEarlier";
  const choices = conditionChoices(variables[controllerIndex]);
  if (choices && !choices.includes(condition.equals)) return "stale";
  return "ok";
}

/**
 * Resolves what each variable contributes to the prompt: its (override or
 * default) value, or an empty string while its condition hides it. Evaluated
 * in list order against the controllers' EFFECTIVE values, so a hidden
 * controller hides its dependents too.
 */
export function effectiveVariableValues(
  variables: ConditionalVariable[],
  overrides: Record<string, string>,
): { values: Record<string, string>; visible: Record<string, boolean> } {
  const values: Record<string, string> = {};
  const visible: Record<string, boolean> = {};
  for (const variable of variables) {
    const condition = variable.config.condition;
    const controller = condition ? variables.find((item) => item.name === condition.variable) : undefined;
    const isVisible =
      !condition || !controller || conditionStatus(variable, variables) !== "ok"
        ? true
        : conditionMatches(condition, controller.type, values[controller.name] ?? "");
    visible[variable.name] = isVisible;
    values[variable.name] = isVisible ? (overrides[variable.name] ?? variable.defaultValue) : "";
  }
  return { values, visible };
}

export type ConditionError = "conditionMissing" | "conditionValueEmpty" | null;

/** Validation of a condition being saved against the variables allowed to control it. */
export function validateCondition(
  condition: PromptVariableCondition | undefined,
  controllers: ConditionalVariable[],
): ConditionError {
  if (!condition) return null;
  const controller = controllers.find((item) => item.name === condition.variable);
  if (!controller) return "conditionMissing";
  if (conditionChoices(controller) === null && condition.equals.trim() === "") return "conditionValueEmpty";
  return null;
}

/** Applies `fn` to a variable's condition; returns the same variable when nothing changed. */
function mapCondition<T extends { config: PromptVariableConfig }>(
  variable: T,
  fn: (condition: PromptVariableCondition) => PromptVariableCondition | undefined,
): T {
  const condition = variable.config.condition;
  if (!condition) return variable;
  const next = fn(condition);
  if (next === condition) return variable;
  const { condition: _removed, ...rest } = variable.config;
  void _removed;
  return { ...variable, config: next ? { ...rest, condition: next } : rest };
}

/** Points every condition that watched `from` at `to` (a variable rename). */
export function renameConditionTarget<T extends { config: PromptVariableConfig }>(variables: T[], from: string, to: string): T[] {
  return variables.map((variable) =>
    mapCondition(variable, (condition) => (condition.variable === from ? { ...condition, variable: to } : condition)),
  );
}

/** Drops every condition that watched `name` (the controlling variable was deleted). */
export function clearConditionsOn<T extends { config: PromptVariableConfig }>(variables: T[], name: string): T[] {
  return variables.map((variable) => mapCondition(variable, (condition) => (condition.variable === name ? undefined : condition)));
}
