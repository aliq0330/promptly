import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allowsDestructive,
  buildApplyStatement,
  destructiveFindings,
  duplicateVersions,
  listMigrationFiles,
  pendingMigrations,
  readBaseline,
} from "./migrations-lib.mjs";

const f = (version) => ({ file: `${version}_x.sql`, version, name: "x" });

test("pending = baseline'dan yeni olup canlıda kaydı olmayanlar, sıralı", () => {
  const files = [f("20260101000000"), f("20260102000000"), f("20260103000000"), f("20260104000000")];
  const pending = pendingMigrations(files, ["20260102000000"], "20260101000000");
  assert.deepEqual(pending.map((p) => p.version), ["20260103000000", "20260104000000"]);
  assert.deepEqual(pendingMigrations(files, [], "20260104000000"), []);
});

test("dosya listesi sürüme göre sıralanır; kalıba uymayan ad hata listesine düşer, sessizce atlanmaz", () => {
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  writeFileSync(join(dir, "20260102000000_b.sql"), "select 1;");
  writeFileSync(join(dir, "20260101000000_a.sql"), "select 1;");
  writeFileSync(join(dir, "oops.sql"), "select 1;");
  writeFileSync(join(dir, "README.md"), "x");
  const { files, bad } = listMigrationFiles(dir);
  assert.deepEqual(files.map((x) => x.version), ["20260101000000", "20260102000000"]);
  assert.deepEqual(bad, ["oops.sql"]);
});

test("aynı sürüm numarası iki dosyada → bulunur", () => {
  assert.deepEqual(duplicateVersions([f("1"), f("2"), f("1")]), ["1"]);
});

test("baseline 14 haneli sürüm olmalı", () => {
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  writeFileSync(join(dir, "ok.txt"), "20260923100100\n");
  writeFileSync(join(dir, "bad.txt"), "abc");
  assert.equal(readBaseline(join(dir, "ok.txt")), "20260923100100");
  assert.throws(() => readBaseline(join(dir, "bad.txt")));
});

test("yıkıcı SQL: drop table/column/function/schema/type/extension/view ve truncate yakalanır", () => {
  for (const sql of ["drop table x;", "ALTER TABLE a DROP COLUMN b;", "drop function public.f();", "drop schema s cascade;", "drop type t;", "drop extension e;", "drop view v;", "truncate a;"]) {
    assert.ok(destructiveFindings(sql).length > 0, sql);
  }
});

test("serbest olanlar: drop trigger/policy/index/constraint if exists, yorumlar ve metin içindeki sözcükler", () => {
  const sql = `
    -- drop table geçmiş_yorum;
    /* truncate x */
    drop trigger if exists t on public.a;
    drop policy if exists p on public.a;
    drop index if exists i;
    alter table a drop constraint c;
    select 'drop table is just text' as note;
  `;
  assert.deepEqual(destructiveFindings(sql), []);
});

test("izin işareti yalnız dosyanın kendi satırında geçerlidir", () => {
  assert.equal(allowsDestructive("-- ci:allow-destructive\ndrop table a;"), true);
  assert.equal(allowsDestructive("select 1; -- ci:allow-destructive"), false);
  assert.equal(allowsDestructive("drop table a;"), false);
});

test("migration + kayıt tek ifadede; ad tırnakları kaçışlanır", () => {
  const stmt = buildApplyStatement("create table a(x int);\n", "20260101000000", "o'neil");
  assert.match(stmt, /^create table a\(x int\);\n;\ninsert into supabase_migrations\.schema_migrations/);
  assert.match(stmt, /'20260101000000', 'o''neil'\) on conflict \(version\) do nothing;/);
});
