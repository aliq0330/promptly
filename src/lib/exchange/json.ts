import { EXCHANGE_JSON_FORMAT, EXCHANGE_SCHEMA_VERSION, fatalResult, normalizeAll, type ExchangePrompt, type ParseResult } from "./prompt-format.ts";

/** Tam yedek biçimi: sürüm numaralı zarf + prompt listesi (değişken tanımlarıyla birlikte). */
export function serializeJson(items: ExchangePrompt[], exportedAt: string = new Date().toISOString()): string {
  return `${JSON.stringify({ format: EXCHANGE_JSON_FORMAT, schemaVersion: EXCHANGE_SCHEMA_VERSION, exportedAt, items }, null, 2)}\n`;
}

/** Zarf, çıplak dizi ya da tek nesne kabul eder. Gelecekteki bir `schemaVersion` sessizce okunmaz, reddedilir. */
export function parseJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fatalResult("invalid_json");
  }
  if (Array.isArray(data)) return normalizeAll(data);
  if (!data || typeof data !== "object") return fatalResult("invalid_json");
  const envelope = data as Record<string, unknown>;
  if (Array.isArray(envelope.items)) {
    const version = envelope.schemaVersion;
    if (typeof version === "number" && version > EXCHANGE_SCHEMA_VERSION) return fatalResult("unsupported_version");
    if (envelope.format !== undefined && envelope.format !== EXCHANGE_JSON_FORMAT) return fatalResult("invalid_json");
    return normalizeAll(envelope.items);
  }
  return normalizeAll([data]);
}
