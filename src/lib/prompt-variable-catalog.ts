/**
 * Hazır alan kütüphanesi → prompt değişkeni dönüştürücüsü (CLAUDE.md §9.145,
 * 1d). Kütüphane (`generator-field-catalog.ts`) Generator için yazılmış tipli
 * alanlar içerir; bu dosya bir kütüphane alanını bir prompt değişkenine
 * çevirir. Saf ve DOM'suz; kütüphanenin kendisini import ETMEZ (yalnızca
 * yapısal bir tip alır), böylece büyük katalog yalnızca seçici açılınca
 * yüklenir.
 *
 * Bilinçli kararlar:
 *  - Kütüphanedeki hazır görsel/renkler taşınmaz (kullanıcı kararı: görsel ve
 *    renk yalnızca yazarın kendi eklediği olmalı).
 *  - Seçeneğin prompt'a yazılan değeri kütüphanenin makine slug'ı değil,
 *    okunur adıdır ("kivircik" değil "Kıvırcık") — prompt metninde anlamlı olsun.
 *  - Kütüphanedeki `color` alanları metin değişkeni olur (prompta hex yazmak
 *    anlamsız; yazar "mavi" gibi yazar).
 */
import { normalizeVariable, sanitizeOptions, validateSpec } from "./prompt-variable-types.ts";
import { normalizeVariableName } from "./prompt-variables.ts";
import type { PromptVariableSpec, PromptVariableType } from "@/types";

/** Kütüphane alanının bu dönüşüm için gereken yapısal kesiti. */
export interface CatalogFieldLike {
  label: string;
  type: string;
  options: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
}

/** Bir değişken taslağının editör-bağımsız verisi (`DraftVariable`'dan `tempId` hariç). */
export interface VariableDraftData extends PromptVariableSpec {
  name: string;
  defaultValue: string;
  description: string;
}

const MAX_NAME_LENGTH = 40;

/** `taken` (küçük harfli adlar) ile çakışmayan, 40 karakteri aşmayan bir değişken adı üretir. */
export function uniqueVariableName(base: string, taken: Set<string>): string {
  const clean = normalizeVariableName(base).slice(0, MAX_NAME_LENGTH) || "degisken";
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let n = 2; n < 1000; n++) {
    const suffix = `_${n}`;
    const candidate = `${clean.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return clean;
}

function variableTypeFor(catalogType: string): PromptVariableType {
  switch (catalogType) {
    case "select":
    case "radio":
      return "select";
    case "multi_select":
      return "multi_select";
    case "number":
      return "number";
    case "slider":
      return "slider";
    case "toggle":
    case "checkbox":
      return "toggle";
    default:
      return "text"; // text, textarea, url, color
  }
}

/** Bir kütüphane alanını, `taken` ile çakışmayacak adla, geçerli ve normalize edilmiş bir değişken taslağına çevirir. */
export function catalogFieldToVariable(field: CatalogFieldLike, taken: Set<string>): VariableDraftData {
  const name = uniqueVariableName(field.label, taken);
  let type = variableTypeFor(field.type);
  const options = sanitizeOptions(field.options.map((option) => ({ label: option.label, value: option.label })));

  let spec: PromptVariableSpec = { type, options: [], config: {} };
  let defaultValue = "";
  if (type === "select" || type === "multi_select") {
    if (options.length < 2) type = "text"; // tek seçenekli "seçim" anlamsız
    else {
      spec = { type, options, config: {} };
      defaultValue = type === "select" ? options[0].value : "";
    }
  }
  if (type === "number" || type === "slider") {
    spec = { type, options: [], config: { min: field.min, max: field.max, step: field.step } };
  }
  if (type === "toggle") {
    spec = { type, options: [], config: { onText: field.label.trim(), offText: "" } };
  }
  if (type === "text") spec = { type: "text", options: [], config: {} };

  // Geçersiz çıkan bir spec'i (örn. bozuk aralık) sessizce düz metne indir.
  const finalSpec = validateSpec(spec) ? { type: "text" as const, options: [], config: {} } : spec;
  const normalized = normalizeVariable(finalSpec, defaultValue);
  return { name, description: "", ...normalized.spec, defaultValue: normalized.defaultValue };
}
