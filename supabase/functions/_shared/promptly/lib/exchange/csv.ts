import { EXCHANGE_LIMITS, ExchangeError, fatalResult, normalizeAll, type ExchangePrompt, type ParseResult } from "./prompt-format.ts";

/** Sütun sırası sabittir; okurken başlıklar ada göre eşleşir (sıra ve fazladan sütunlar önemsiz). */
export const CSV_COLUMNS = ["title", "description", "prompt_text", "content_type", "category", "subcategory", "tools", "tags", "source_credit", "source_url"] as const;

/**
 * Excel/Sheets'te formül gibi çalışabilen hücreler (`=`, `+`, `-`, `@`, sekme, satır başı) tek tırnakla başlatılır
 * (CSV enjeksiyonu). Zaten tırnakla başlayıp aynı karakterlerle devam eden metin bir tırnak daha alır; okurken tek bir
 * tırnak geri alınır — böylece yazma → okuma birebir aynı metni verir.
 */
const FORMULA_START = /^'*[=+\-@\t\r]/;
const ESCAPED_FORMULA_START = /^'+[=+\-@\t\r]/;

function guardCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

function unguardCell(value: string): string {
  return ESCAPED_FORMULA_START.test(value) ? value.slice(1) : value;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function stringifyCsvRows(rows: string[][]): string {
  return rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
}

/** RFC 4180: tırnaklı hücrelerde virgül ve satır sonu, `""` = tırnak. Kapanmayan tırnak hata sayılır. */
export function parseCsvRows(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let touched = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") {
      inQuotes = true;
      touched = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
      touched = true;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      if (touched || row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      touched = false;
    } else {
      cell += char;
      touched = true;
    }
  }
  if (inQuotes) throw new ExchangeError("invalid_csv");
  if (touched || cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value !== ""));
}

export function serializeCsv(items: ExchangePrompt[]): string {
  const rows = [
    [...CSV_COLUMNS] as string[],
    ...items.map((item) =>
      [
        item.title,
        item.description,
        item.promptText,
        item.contentType,
        item.category ?? "",
        item.subcategory ?? "",
        // Etiket ve araç adları kontrol karakteri taşıyamaz (doğrulama) — satır sonu güvenli ayraçtır.
        item.tools.join("\n"),
        item.tags.join("\n"),
        item.source?.credit ?? "",
        item.source?.url ?? "",
      ].map(guardCell),
    ),
  ];
  return stringifyCsvRows(rows);
}

export function parseCsv(text: string, maxItems: number = EXCHANGE_LIMITS.items): ParseResult {
  let rows: string[][];
  try {
    rows = parseCsvRows(text);
  } catch {
    return fatalResult("invalid_csv");
  }
  if (rows.length === 0) return fatalResult("empty");
  const header = rows[0].map((name) => name.trim().toLowerCase());
  const index = (name: string) => header.indexOf(name);
  if (index("title") < 0 || index("prompt_text") < 0) return fatalResult("missing_columns");
  const records = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    for (const column of CSV_COLUMNS) {
      const at = index(column);
      record[column] = at >= 0 ? unguardCell(cells[at] ?? "") : "";
    }
    return record;
  });
  return normalizeAll(records, maxItems);
}
