// Migration yayın boru hattının saf mantığı (docs/history/226-*): dosya listesi, bekleyenleri seçme, yıkıcı SQL tespiti.
// Ağa/veritabanına dokunmaz; `apply-migrations.mjs` bunu kullanır, `src/lib/migration-runner.test.ts` sınar.
import { readdirSync, readFileSync } from "node:fs";

const FILE_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/;

/** `migrations/` içindeki `.sql` dosyaları, sürüme göre sıralı. Adı kalıba uymayan dosya hata sayılır (sessizce atlanmaz). */
export function listMigrationFiles(dir) {
  const files = [];
  const bad = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".sql")) continue;
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      bad.push(file);
      continue;
    }
    files.push({ file, version: match[1], name: match[2] });
  }
  files.sort((a, b) => a.version.localeCompare(b.version));
  return { files, bad };
}

/** Aynı sürüm numarasını taşıyan iki dosya (sıra belirsiz olur). */
export function duplicateVersions(files) {
  const seen = new Set();
  const dup = new Set();
  for (const f of files) (seen.has(f.version) ? dup : seen).add(f.version);
  return [...dup];
}

/** Tek satırlık taban çizgisi dosyası: bu sürüme KADAR (dahil) olanlar canlıda kabul edilir, CI'nın yeniden uygulamaya çalışmaması için. */
export function readBaseline(path) {
  const text = readFileSync(path, "utf8").trim();
  if (!/^\d{14}$/.test(text)) throw new Error(`Baseline dosyası 14 haneli bir sürüm içermeli: ${path}`);
  return text;
}

/** Taban çizgisinden yeni olup canlıda kaydı bulunmayanlar (sıralı). */
export function pendingMigrations(files, appliedVersions, baseline) {
  const applied = new Set(appliedVersions);
  return files.filter((f) => f.version > baseline && !applied.has(f.version));
}

/** SQL'den yorumları ve metin değişmezlerini (tırnaklı) atar; tespit yalnız gerçek ifadelere bakar. */
export function stripSqlNoise(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

const DESTRUCTIVE = [
  [/\bdrop\s+table\b/i, "drop table"],
  [/\bdrop\s+(?:materialized\s+)?view\b/i, "drop view"],
  [/\bdrop\s+column\b/i, "drop column"],
  [/\bdrop\s+schema\b/i, "drop schema"],
  [/\bdrop\s+function\b/i, "drop function"],
  [/\bdrop\s+type\b/i, "drop type"],
  [/\bdrop\s+extension\b/i, "drop extension"],
  [/\btruncate\b/i, "truncate"],
];

/**
 * Veri/şema silen ifadeler (`drop trigger/policy/index/constraint … if exists` yeniden oynatılabilirlik içindir ve serbesttir).
 * Dosya `-- ci:allow-destructive` işaretini taşıyorsa ya da çağıran izin verdiyse sorun sayılmaz.
 */
export function destructiveFindings(sql) {
  const body = stripSqlNoise(sql);
  return DESTRUCTIVE.filter(([re]) => re.test(body)).map(([, label]) => label);
}

export function allowsDestructive(sql) {
  return /^\s*--\s*ci:allow-destructive\b/m.test(sql);
}

/** Migration + kayıt TEK istekte (tek işlem): kayıt yazılamazsa migration da geri alınır, ikisi hiç ayrışmaz. */
export function buildApplyStatement(sql, version, name) {
  const safeName = name.replace(/'/g, "''");
  return `${sql.replace(/\s*$/, "")}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${safeName}') on conflict (version) do nothing;\n`;
}
