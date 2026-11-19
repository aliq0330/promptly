/**
 * MCP `save_prompt_draft` / REST için GELEN değişken tanımlarını (yapay zekâ ya da betik yazar) `import_prompts`'un okuduğu biçime çevirir
 * (docs/history/439-*). Yalnız biçim denetimi ve dönüştürme yapar; kural veritabanındadır (`import_prompts` aynı sınırları yeniden denetler).
 *
 * Amaç: skill/araç "şu metindeki `{city}`'nin türü, açıklaması, varsayılanı (= örnek görselde kullanılan değer) ve örnek değerleri şunlar" diyebilsin;
 * yanlış tanımlar (varsayılanı seçeneklerde olmayan seçim, bozuk aralık) sessizce başka değere dönmez, AÇIK hata verir — yoksa prompt sayfasındaki
 * varsayılan değer, görseli üretmekte kullanılan değerden farklı olurdu.
 */
import { EXCHANGE_LIMITS, EXCHANGE_VARIABLE_TYPES, type ExchangeVariable, type ExchangeVariableType } from "../exchange/prompt-format.ts";
import { MAX_SUGGESTION_LENGTH, sanitizeSuggestions } from "../prompt-variables.ts";
import { PublicApiError } from "./rest.ts";

/** Araç girişindeki tek değişken. Hepsi isteğe bağlıdır, `name` hariç. */
export interface DraftVariableInput {
  name: string;
  /** Ne işe yaradığı (okuyucu alanın yanında görür). */
  description?: string;
  /** Örnek görselde kullanılan değer: prompt sayfası bu değerle dolu açılır. */
  default_value?: string;
  /** Varsayılan `text`. */
  type?: string;
  /** `select` / `multi_select`: seçenek değerleri (en az 2). */
  options?: string[];
  /** `text`: 2–4 örnek değer; okuyucuya dokununca dolduran çipler olarak görünür. */
  examples?: string[];
  min?: number;
  max?: number;
  step?: number;
  /** `toggle`: açıkken metne yazılan / kapalıyken yazılan değer. */
  on_text?: string;
  off_text?: string;
}

const NAME_PATTERN = /^[^{}\s]{1,40}$/u;
const MAX_OPTION_VALUE = MAX_SUGGESTION_LENGTH;

function fail(index: number, name: string, message: string): never {
  throw new PublicApiError("bad_request", `variables[${index}] ("${name}"): ${message}`);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** `{city}` ya da ` city ` gelirse `city`: yapay zekâ jetonu parantezli yazabilir. */
export function cleanVariableName(raw: unknown): string {
  const trimmed = text(raw).trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1).trim() : trimmed;
}

export function variablesFromInput(raw: unknown): ExchangeVariable[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new PublicApiError("bad_request", "variables must be an array.");
  if (raw.length > EXCHANGE_LIMITS.variables) throw new PublicApiError("bad_request", `At most ${EXCHANGE_LIMITS.variables} variables are allowed.`);
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new PublicApiError("bad_request", `variables[${index}] must be an object.`);
    const input = entry as Record<string, unknown>;
    const name = cleanVariableName(input.name);
    if (!NAME_PATTERN.test(name)) fail(index, name, "name must be 1–40 characters without spaces or braces.");
    if (seen.has(name)) fail(index, name, "duplicate variable name.");
    seen.add(name);

    const type = (text(input.type) || "text") as ExchangeVariableType;
    if (!(EXCHANGE_VARIABLE_TYPES as readonly string[]).includes(type)) fail(index, name, `type must be one of ${EXCHANGE_VARIABLE_TYPES.join(", ")}.`);
    const description = text(input.description).trim();
    if (description.length > EXCHANGE_LIMITS.variableDescription) fail(index, name, `description is longer than ${EXCHANGE_LIMITS.variableDescription} characters.`);
    const given = input.default_value === undefined || input.default_value === null ? null : text(input.default_value).trim();
    const base = { name, description: description || null };

    if (type === "select" || type === "multi_select") {
      const rawOptions = Array.isArray(input.options) ? input.options : [];
      const values: string[] = [];
      for (const option of rawOptions) {
        const value = text(option).replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_OPTION_VALUE).trim();
        if (value && !values.includes(value)) values.push(value);
      }
      if (values.length < 2) fail(index, name, `${type} needs at least 2 distinct options.`);
      if (values.length > EXCHANGE_LIMITS.variableOptions) fail(index, name, `at most ${EXCHANGE_LIMITS.variableOptions} options.`);
      let defaultValue: string;
      if (type === "select") {
        defaultValue = given ?? values[0];
        if (!values.includes(defaultValue)) fail(index, name, `default_value "${defaultValue}" is not one of its options (${values.join(" | ")}).`);
      } else {
        const picked = (given ?? "").split(",").map((part) => part.trim()).filter(Boolean);
        const unknown = picked.find((part) => !values.includes(part));
        if (unknown) fail(index, name, `default_value "${unknown}" is not one of its options (${values.join(" | ")}).`);
        defaultValue = values.filter((value) => picked.includes(value)).join(", ");
      }
      return { ...base, defaultValue, type, options: values.map((value) => ({ label: value, value })), config: {} };
    }

    if (type === "number" || type === "slider") {
      const min = typeof input.min === "number" ? input.min : 0;
      const max = typeof input.max === "number" ? input.max : 100;
      const step = typeof input.step === "number" ? input.step : 1;
      if (![min, max, step].every(Number.isFinite) || max <= min || step <= 0) fail(index, name, "min must be below max and step above 0.");
      const parsed = given === null || given === "" ? min : Number(given);
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) fail(index, name, `default_value must be a number between ${min} and ${max}.`);
      return { ...base, defaultValue: String(parsed), type, options: [], config: { min, max, step } };
    }

    if (type === "toggle") {
      const onText = text(input.on_text).trim();
      const offText = text(input.off_text).trim();
      if (!onText) fail(index, name, "toggle needs on_text (what is written into the prompt when it is on).");
      if (onText === offText) fail(index, name, "on_text and off_text must differ.");
      const defaultValue = given ?? offText;
      if (defaultValue !== onText && defaultValue !== offText) fail(index, name, "default_value must be on_text or off_text.");
      return { ...base, defaultValue, type, options: [], config: { onText, offText } };
    }

    const examples = sanitizeSuggestions(input.examples);
    return { ...base, defaultValue: given ?? "", type: "text", options: [], config: examples.length ? { suggestions: examples } : {} };
  });
}
