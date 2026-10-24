#!/usr/bin/env node
// Bekleyen migration'ları canlı veritabanına sırayla uygular (docs/history/226-*). `supabase db push` KULLANILMAZ: canlıda iki ayrı
// sürüm kaydı biçimi var (repo sürümleri + MCP'nin kendi zaman damgaları), `db push` bu yüzden güvenle duruyor. Bunun yerine:
//   • `supabase/migrations-baseline.txt` = canlıda olduğu bilinen son sürüm; yalnız ondan YENİ dosyalar adaydır.
//   • Adaylardan `schema_migrations`'ta kaydı olmayanlar bekleyendir; her biri TEK işlemde (migration + kayıt) uygulanır.
//   • Yıkıcı ifade (drop table/column/function/…, truncate) içeren bekleyen migration, `-- ci:allow-destructive` işareti
//     (ya da MIGRATE_ALLOW_DESTRUCTIVE=1) olmadan UYGULANMAZ; boru hattı durur.
//   • İlk hatada durur (sonrakiler uygulanmaz); çıkış kodu ≠ 0 → site yayınlanmaz.
//
// Kullanım:
//   node scripts/apply-migrations.mjs --check     # yalnız dosya adı/yıkıcı SQL denetimi, ağ yok (PR'lerde)
//   node scripts/apply-migrations.mjs --dry-run   # bekleyenleri listeler, uygulamaz
//   node scripts/apply-migrations.mjs             # uygular
// Ortam: SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF (Management API) — ya da yerel deneme için MIGRATE_DRIVER=psql (+ PG* değişkenleri).
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowsDestructive,
  buildApplyStatement,
  destructiveFindings,
  duplicateVersions,
  listMigrationFiles,
  pendingMigrations,
  readBaseline,
} from "./migrations-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = process.env.MIGRATIONS_DIR ?? join(root, "supabase", "migrations");
const baselinePath = process.env.MIGRATIONS_BASELINE ?? join(root, "supabase", "migrations-baseline.txt");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const dryRun = args.has("--dry-run");
const allowDestructiveEnv = process.env.MIGRATE_ALLOW_DESTRUCTIVE === "1";

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const { files, bad } = listMigrationFiles(migrationsDir);
if (bad.length > 0) fail(`Migration dosya adı <14 haneli sürüm>_<ad>.sql kalıbına uymuyor: ${bad.join(", ")}`);
const dup = duplicateVersions(files);
if (dup.length > 0) fail(`Aynı sürüm numarasını taşıyan birden çok migration var: ${dup.join(", ")}`);

const baseline = readBaseline(baselinePath);
const candidates = files.filter((f) => f.version > baseline);

function lint(list) {
  const problems = [];
  for (const f of list) {
    const sql = readFileSync(join(migrationsDir, f.file), "utf8");
    const found = destructiveFindings(sql);
    if (found.length > 0 && !allowsDestructive(sql) && !allowDestructiveEnv) {
      problems.push(`${f.file}: yıkıcı ifade (${[...new Set(found)].join(", ")}) — gerekliyse dosyanın başına "-- ci:allow-destructive" yazıp PR'da onaylat`);
    }
  }
  return problems;
}

if (checkOnly) {
  const problems = lint(candidates);
  if (problems.length > 0) fail(problems.join("\n"));
  console.log(`Migration denetimi temiz (${files.length} dosya, taban çizgisi ${baseline}, ${candidates.length} aday).`);
  process.exit(0);
}

if (candidates.length === 0) {
  console.log(`Taban çizgisinden (${baseline}) yeni migration yok; yapılacak bir şey yok.`);
  process.exit(0);
}

// ── Sürücü: Management API (CI) ya da psql (yerel deneme) ─────────────────────────────────────────────────────────────────
const driver = process.env.MIGRATE_DRIVER ?? "api";

async function runApi(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) fail("SUPABASE_ACCESS_TOKEN ve SUPABASE_PROJECT_REF depo secret'ları tanımlı olmalı (bekleyen migration var).");
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${response.status} ${typeof body === "string" ? body : (body?.message ?? JSON.stringify(body))}`);
  return body;
}

function runPsql(query, { rows }) {
  const base = ["-X", "-v", "ON_ERROR_STOP=1", "-q"];
  const out = rows
    ? spawnSync("psql", [...base, "-At", "-c", query], { encoding: "utf8" })
    : spawnSync("psql", [...base, "--single-transaction", "-f", "-"], { input: query, encoding: "utf8" });
  if (out.status !== 0) throw new Error((out.stderr || out.stdout || "psql failed").trim());
  return rows ? out.stdout.split("\n").filter(Boolean) : [];
}

async function appliedVersions() {
  const query = `select version from supabase_migrations.schema_migrations where version > '${baseline}' order by version`;
  if (driver === "psql") return runPsql(query, { rows: true });
  const rows = await runApi(query);
  return rows.map((r) => r.version);
}

async function apply(statement) {
  if (driver === "psql") return runPsql(statement, { rows: false });
  await runApi(statement);
}

const pending = pendingMigrations(candidates, await appliedVersions(), baseline);
if (pending.length === 0) {
  console.log(`Aday ${candidates.length} migration'ın hepsi canlıda kayıtlı; yapılacak bir şey yok.`);
  process.exit(0);
}

const problems = lint(pending);
if (problems.length > 0) fail(problems.join("\n"));

console.log(`Bekleyen ${pending.length} migration:`);
for (const f of pending) console.log(`  • ${f.version}_${f.name}`);
if (dryRun) process.exit(0);

for (const f of pending) {
  const sql = readFileSync(join(migrationsDir, f.file), "utf8");
  process.stdout.write(`Uygulanıyor: ${f.file} … `);
  try {
    await apply(buildApplyStatement(sql, f.version, f.name));
  } catch (error) {
    console.log("HATA");
    fail(`${f.file} uygulanamadı (işlem geri alındı, sonraki migration'lar ve site yayını durduruldu): ${error.message}`);
  }
  console.log("tamam");
}
console.log(`${pending.length} migration uygulandı ve kaydedildi.`);
