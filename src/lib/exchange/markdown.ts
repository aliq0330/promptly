import {
  EXCHANGE_SCHEMA_VERSION,
  ExchangeError,
  fatalResult,
  normalizePrompt,
  EXCHANGE_LIMITS,
  type ExchangeIssue,
  type ExchangePrompt,
  type ParseResult,
} from "./prompt-format.ts";

/**
 * Markdown biçimi: her prompt `---` ile çevrili bir üst bilgi bloğu + prompt metni (gövde). Üst bilgi YAML DEĞİLDİR,
 * bilerek çok dar bir alt kümedir (`anahtar: değer`; değer JSON dizgesi/dizisi ya da çıplak metin/`[a, b]` listesi) —
 * çapa, etiket, çok satırlı blok gibi YAML özellikleri yok, bu yüzden kullanıcı dosyasından kod/nesne üretilemez.
 * Birden çok prompt tek dosyada `PROMPT_SEPARATOR` satırıyla ayrılır.
 */
export const PROMPT_SEPARATOR = "<!-- promptly:next -->";

const KEY_LINE = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/;

function frontmatterLine(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (typeof value === "string" && value === "") return null;
  return `${key}: ${JSON.stringify(value)}`;
}

function documentFor(item: ExchangePrompt): string {
  if (item.promptText.split(/\r?\n/).some((line) => line.trim() === PROMPT_SEPARATOR)) throw new ExchangeError("markdown_separator");
  const lines = [
    frontmatterLine("schemaVersion", EXCHANGE_SCHEMA_VERSION),
    frontmatterLine("title", item.title),
    frontmatterLine("description", item.description),
    frontmatterLine("contentType", item.contentType),
    frontmatterLine("category", item.category),
    frontmatterLine("subcategory", item.subcategory),
    frontmatterLine("tools", item.tools),
    frontmatterLine("tags", item.tags),
  ].filter((line): line is string => line !== null);
  return `---\n${lines.join("\n")}\n---\n\n${item.promptText}\n`;
}

export function serializeMarkdown(items: ExchangePrompt[]): string {
  return items.map(documentFor).join(`\n${PROMPT_SEPARATOR}\n\n`);
}

function unquote(text: string): string {
  const quoted = /^(["'])([\s\S]*)\1$/.exec(text);
  return quoted ? quoted[2] : text;
}

function parseValue(raw: string): string | string[] {
  const text = raw.trim();
  if (text.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "string") return parsed;
    } catch {
      // elle yazılmış tırnaksız/bozuk değer: aşağıda çıplak metin gibi okunur
    }
    return unquote(text);
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((entry) => (typeof entry === "string" ? entry : String(entry)));
    } catch {
      // `[a, b]` gibi elle yazılmış liste
    }
    return text
      .slice(1, -1)
      .split(",")
      .map((entry) => unquote(entry.trim()))
      .filter(Boolean);
  }
  return unquote(text);
}

/** Tek bir belge parçası → ham kayıt; üst bilgisi yoksa null. */
function parseDocument(chunk: string): Record<string, unknown> | null {
  const lines = chunk.replace(/^﻿/, "").split(/\r?\n/);
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start++;
  if (lines[start]?.trim() !== "---") return null;
  let end = start + 1;
  while (end < lines.length && lines[end].trim() !== "---") end++;
  if (end >= lines.length) return null;

  const record: Record<string, unknown> = {};
  for (const line of lines.slice(start + 1, end)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const match = KEY_LINE.exec(line);
    if (match) record[match[1]] = parseValue(match[2]);
  }
  record.promptText = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\n+/, "");
  return record;
}

export function parseMarkdown(text: string): ParseResult {
  const chunks = text
    .split(/\r?\n/)
    .reduce<string[][]>(
      (groups, line) => {
        if (line.trim() === PROMPT_SEPARATOR) groups.push([]);
        else groups[groups.length - 1].push(line);
        return groups;
      },
      [[]],
    )
    .map((lines) => lines.join("\n"))
    .filter((chunk) => chunk.trim() !== "");

  if (chunks.length === 0) return fatalResult("empty");
  if (chunks.length > EXCHANGE_LIMITS.items) return { ...fatalResult("too_many_items"), total: chunks.length };

  const items: ExchangePrompt[] = [];
  const issues: ExchangeIssue[] = [];
  chunks.forEach((chunk, index) => {
    const row = index + 1;
    const record = parseDocument(chunk);
    if (!record) {
      issues.push({ row, field: "", code: "missing_frontmatter" });
      return;
    }
    const version = Number(record.schemaVersion);
    if (Number.isFinite(version) && version > EXCHANGE_SCHEMA_VERSION) {
      issues.push({ row, field: "schemaVersion", code: "invalid_row" });
      return;
    }
    const result = normalizePrompt(record, row);
    if (result.item) items.push(result.item);
    issues.push(...result.issues);
  });
  return { items, issues, fatal: null, total: chunks.length };
}
