// Üretilmiş dil sözlükleri (src/lib/i18n/generated/*) kaynakla (translations*.ts) eşit mi? — docs/history/372-*.
// Kırmızıysa: `node scripts/build-i18n.mjs` çalıştır ve üretilen dosyaları da işle.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildAll, loadSourceTranslations } from "../../scripts/build-i18n.mjs";

const GENERATED = join(process.cwd(), "src", "lib", "i18n", "generated");

test("üretilmiş tr/en sözlükleri translations*.ts ile birebir aynı", async () => {
  const files = (await buildAll()) as Record<string, string>;
  for (const [lang, text] of Object.entries(files)) {
    assert.equal(readFileSync(join(GENERATED, `${lang}.ts`), "utf8"), text, `generated/${lang}.ts eski — node scripts/build-i18n.mjs`);
  }
});

test("her anahtarın iki dilde de boş olmayan metni var", async () => {
  const translations = (await loadSourceTranslations()) as Record<string, { tr: unknown; en: unknown }>;
  const bad = Object.entries(translations)
    .filter(([, v]) => typeof v.tr !== "string" || typeof v.en !== "string" || !v.tr || !v.en)
    .map(([k]) => k);
  assert.deepEqual(bad, []);
});

test("hiçbir kaynak dosya translations.ts'ten DEĞER içe aktarmaz (yalnız tip) — aksi hâlde iki dil birden pakete girer", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.ts$/.test(entry.name) || /[\\/]i18n[\\/]translations[\w-]*\.ts$/.test(full)) continue;
      for (const line of readFileSync(full, "utf8").split("\n")) {
        if (/from "(@\/lib\/i18n|\.{1,2}(\/\.\.)*(\/i18n)?)\/translations[\w-]*(\.ts)?"/.test(line) && !/^import type /.test(line)) offenders.push(`${full}: ${line.trim()}`);
      }
    }
  };
  walk(join(process.cwd(), "src"));
  assert.deepEqual(offenders, []);
});
