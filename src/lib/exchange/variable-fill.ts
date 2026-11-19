/**
 * Metinde `{ad}` olarak geçip tanımı olmayan jetonlar için değişken satırı üretir (docs/history/439-*).
 *
 * Neden var: içeri aktarma yolları (MCP, Telegram, açık API, uzantı, dosya) promptu `variables: []` ile yazınca metindeki jetonlar
 * "tanımsız" kalıyordu — prompt sayfasında doldurma alanı çıkmıyor, kopyalanan metinde süslü parantez duruyordu. Bu yardımcı TEK
 * yerdir: yeni bir içeri aktarma yolu kendi jeton taramasını yazmaz, bunu çağırır.
 *
 * Bağımlılıksızdır (yalnız göreli içe aktarma): Edge Function kopyasında da çalışır.
 */
import { definableOrphanNames, extractVariableTokenNames } from "../prompt-variables.ts";
import { EXCHANGE_LIMITS, type ExchangePrompt, type ExchangeVariable } from "./prompt-format.ts";

export interface VariableFillReport {
  /** Metinde olup tanımı olmadığı için boş metin değişkeni olarak EKLENEN jetonlar. */
  autoDefined: string[];
  /** Tanımlanacaktı ama değişken sınırı (30) dolduğu için eklenemeyenler. */
  skipped: string[];
  /** Tanımı olup metinde hiç geçmeyen değişkenler (kaydedilir, ama doldurulacak yeri yoktur). */
  unused: string[];
}

export function emptyTextVariable(name: string): ExchangeVariable {
  return { name, defaultValue: "", description: null, type: "text", options: [], config: {} };
}

/** `item`'ın değişken listesini metindeki jetonlarla tamamlar; verilen tanımlara dokunmaz. Girdiyi değiştirmez. */
export function withDefinedVariables(item: ExchangePrompt): { item: ExchangePrompt; report: VariableFillReport } {
  const tokens = new Set(extractVariableTokenNames(item.promptText));
  const unused = item.variables.map((variable) => variable.name).filter((name) => !tokens.has(name));
  const orphans = definableOrphanNames(item.promptText, item.variables.map((variable) => variable.name));
  const room = Math.max(0, EXCHANGE_LIMITS.variables - item.variables.length);
  const add = orphans.slice(0, room);
  return {
    item: add.length ? { ...item, variables: [...item.variables, ...add.map(emptyTextVariable)] } : item,
    report: { autoDefined: add, skipped: orphans.slice(room), unused },
  };
}
