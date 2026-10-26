import { parseCsv, serializeCsv } from "./csv.ts";
import { parseJson, serializeJson } from "./json.ts";
import { parseMarkdown, serializeMarkdown } from "./markdown.ts";
import { EXCHANGE_LIMITS, fatalResult, type ExchangeFormat, type ExchangePrompt, type ParseResult } from "./prompt-format.ts";

export * from "./prompt-format.ts";
export { PROMPT_SEPARATOR } from "./markdown.ts";
export { detectPromptsChat, parsePromptsChat } from "./prompts-chat.ts";
export { runBatches, runChunks, type ChunkOutcome, type BulkBatchReport, type BulkInvalid, type BulkItemResult, type BulkOutcome, type BulkProgress } from "./bulk.ts";

export const FORMAT_META: Record<ExchangeFormat, { extension: string; mime: string }> = {
  json: { extension: "json", mime: "application/json" },
  csv: { extension: "csv", mime: "text/csv" },
  markdown: { extension: "md", mime: "text/markdown" },
};

export function serializePrompts(items: ExchangePrompt[], format: ExchangeFormat): string {
  if (format === "csv") return serializeCsv(items);
  if (format === "markdown") return serializeMarkdown(items);
  return serializeJson(items);
}

/** `text`'in kendi bayt boyutunu sınırlar; sonra seçilen biçimde ayrıştırır ve her kaydı doğrular. */
export function parsePrompts(text: string, format: ExchangeFormat, limits: { maxItems?: number; maxBytes?: number } = {}): ParseResult {
  const maxItems = limits.maxItems ?? EXCHANGE_LIMITS.items;
  if (text.trim() === "") return fatalResult("empty");
  if (text.length > (limits.maxBytes ?? EXCHANGE_LIMITS.fileBytes)) return fatalResult("too_large");
  if (format === "csv") return parseCsv(text, maxItems);
  if (format === "markdown") return parseMarkdown(text, maxItems);
  return parseJson(text, maxItems);
}

export function formatFromFileName(name: string): ExchangeFormat | null {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  if (extension === "json") return "json";
  if (extension === "csv") return "csv";
  if (extension === "md" || extension === "markdown") return "markdown";
  return null;
}

const TURKISH_ASCII: Record<string, string> = { ı: "i", ğ: "g", ü: "u", ş: "s", ö: "o", ç: "c" };

/**
 * `promptly-prompts-2026-10-26.json` / tek prompt için başlıktan türetilmiş ad. Yalnız ASCII (`a-z0-9-`): her dosya sisteminde, git
 * yollarında ve komut satırında sorunsuz çalışsın diye `ğ → g`, `İ → i` gibi çevrilir; çevrilemeyen harfler (ör. Japonca) atılır.
 */
export function exportFileName(format: ExchangeFormat, base: string, date: Date = new Date()): string {
  const slug = base
    .toLocaleLowerCase("tr")
    .replace(/[ıığüşöç]/g, (char) => TURKISH_ASCII[char] ?? char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || `promptly-prompts-${date.toISOString().slice(0, 10)}`}.${FORMAT_META[format].extension}`;
}
