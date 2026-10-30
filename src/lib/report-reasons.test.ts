/**
 * Merkezi şikâyet nedenleri (docs/history/284-*): istemci tablosu (`report-reasons.ts`) ile veritabanındaki `_report_reasons_for()` AYNI olmalı,
 * her kod için çeviri anahtarı olmalı, "Diğer" her listenin sonunda olmalı, "Diğer" ek bilgi ister.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  REPORT_REASON_CODES,
  REPORT_REASONS_BY_TARGET,
  REPORT_TARGET_TYPES,
  reportDetailsProblem,
  reportReasonsFor,
  type ReportTargetType,
} from "./report-reasons.ts";

const ROOT = new URL("../../", import.meta.url).pathname;

function migrationSource(): string {
  const dir = join(ROOT, "supabase", "migrations");
  const file = readdirSync(dir).filter((name) => name.endsWith("_report_reasons.sql")).sort().at(-1);
  assert.ok(file, "report_reasons migration bulunamadı");
  return readFileSync(join(dir, file), "utf8");
}

/** `when p_target_type in ('a','b') then array['x','y']` / `= 'c' then array[...]` bloklarını türe göre ayrıştırır. */
function sqlTable(): Record<string, string[]> {
  const sql = migrationSource();
  const body = sql.slice(sql.indexOf("create or replace function public._report_reasons_for"));
  const end = body.indexOf("$$;");
  const result: Record<string, string[]> = {};
  const re = /when p_target_type (?:in \(([^)]*)\)|= '([^']+)')\s+then array\[([^\]]*)\]/g;
  for (const match of body.slice(0, end).matchAll(re)) {
    const types = (match[1] ?? `'${match[2]}'`).match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
    const codes = match[3].match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
    for (const type of types) result[type] = codes;
  }
  return result;
}

test("the client reason table matches the database function, type by type", () => {
  const sql = sqlTable();
  assert.deepEqual(Object.keys(sql).sort(), [...REPORT_TARGET_TYPES].sort());
  for (const type of REPORT_TARGET_TYPES) {
    assert.deepEqual(sql[type], [...reportReasonsFor(type)], `${type}: istemci ile SQL nedenleri farklı`);
  }
});

test("every list ends with 'other', has no duplicates and only known codes", () => {
  for (const type of REPORT_TARGET_TYPES as readonly ReportTargetType[]) {
    const list = REPORT_REASONS_BY_TARGET[type];
    assert.equal(list.at(-1), "other", `${type}: «Diğer» en sonda olmalı`);
    assert.equal(new Set(list).size, list.length, `${type}: yinelenen neden`);
    for (const code of list) assert.ok((REPORT_REASON_CODES as readonly string[]).includes(code), `${type}: bilinmeyen kod ${code}`);
  }
});

test("the reason code list matches the database CHECK constraint and has a label for every code", () => {
  const sql = migrationSource();
  const check = /reports_reason_code_check check \(\s*reason_code is null or reason_code in \(([^)]*)\)/.exec(sql);
  assert.ok(check);
  assert.deepEqual(check[1].match(/'([^']+)'/g)!.map((x) => x.slice(1, -1)), [...REPORT_REASON_CODES]);
  for (const code of REPORT_REASON_CODES) assert.match(sql, new RegExp(`when '${code}' then '`), `${code}: SQL etiketi yok`);
});

test("every reason and target type has a TR+EN translation", () => {
  const translations = readFileSync(join(ROOT, "src", "lib", "i18n", "translations.ts"), "utf8");
  const keys = [
    ...REPORT_REASON_CODES.flatMap((code) => [`report.reason.${code}.title`, `report.reason.${code}.desc`]),
    "report.type.prompt", "report.type.request", "report.type.workflow", "report.type.preset", "report.type.space", "report.type.quote",
    "report.type.story", "report.type.user", "report.type.comment", "report.type.message", "report.type.community", "report.type.communityPost", "report.type.chatMessage",
  ];
  for (const key of keys) assert.match(translations, new RegExp(`"${key.replace(/\./g, "\\.")}": \\{ tr: "[^"]+", en: "[^"]+" \\}`), `${key}: TR+EN çeviri yok`);
});

test("details: a reason is required, and 'other' needs a short description", () => {
  assert.equal(reportDetailsProblem(null, ""), "reason");
  assert.equal(reportDetailsProblem("spam", ""), null);
  assert.equal(reportDetailsProblem("other", ""), "details");
  assert.equal(reportDetailsProblem("other", "  ab  "), "details");
  assert.equal(reportDetailsProblem("other", " abc "), null);
});
