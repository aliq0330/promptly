// Dil başına çalışma zamanı sözlüğü üretir: src/lib/i18n/generated/{tr,en}.ts (docs/history/372-*).
//
// Kaynak HÂLÂ `src/lib/i18n/translations*.ts`'tir (`{ tr, en }` çiftleri, CLAUDE.md §4.5) — yeni metin oraya yazılır.
// Tarayıcı ise yalnız etkin dilin düz sözlüğünü indirir (Türkçe sayfayla birlikte, İngilizce yalnız gerekince ayrı parça);
// iki dili birden taşıyan dev nesne pakete girmez (her sayfada ~80 KB gzip tasarruf).
//
// Çalıştırma: `node scripts/build-i18n.mjs` (npm `prebuild`/`predev` da çalıştırır). Üretilen dosyalar repoda tutulur;
// `src/lib/i18n-dictionary.test.ts` kaynakla eşit olduklarını denetler — çeviri ekleyip bu betiği çalıştırmayı unutursan
// `npm test` kırmızı olur. `--check`: dosya yazmadan, eskiyse 1 ile çıkar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src", "lib", "i18n");
const OUT = path.join(SRC, "generated");
export const LANGUAGES = ["tr", "en"];

/** `translations*.ts`'i geçici bir klasöre JS olarak derleyip birleşik sözlüğü yükler. */
export async function loadSourceTranslations() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "promptly-i18n-"));
  try {
    for (const file of fs.readdirSync(SRC).filter((f) => /^translations.*\.ts$/.test(f) && !f.endsWith(".test.ts"))) {
      const js = ts
        .transpileModule(fs.readFileSync(path.join(SRC, file), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        .outputText.replace(/from "\.\/(translations[\w-]*)"/g, 'from "./$1.mjs"');
      fs.writeFileSync(path.join(tmp, file.replace(/\.ts$/, ".mjs")), js);
    }
    const mod = await import(pathToFileURL(path.join(tmp, "translations.mjs")).href);
    return mod.translations;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Bir dilin üretilmiş dosya metni (anahtar başına bir satır — PR farkı okunur kalsın). */
export function renderDictionary(translations, lang) {
  const lines = Object.entries(translations).map(([key, value]) => {
    const text = value[lang];
    if (typeof text !== "string") throw new Error(`i18n: "${key}" için ${lang} metni yok`);
    return `  ${JSON.stringify(key)}: ${JSON.stringify(text)},`;
  });
  return [
    "// ÜRETİLDİ — elle düzenleme. Kaynak: src/lib/i18n/translations*.ts · `node scripts/build-i18n.mjs` (docs/history/372-*).",
    "const dictionary: Record<string, string> = {",
    ...lines,
    "};",
    "export default dictionary;",
    "",
  ].join("\n");
}

export async function buildAll() {
  const translations = await loadSourceTranslations();
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, renderDictionary(translations, lang)]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const files = await buildAll();
  let stale = false;
  fs.mkdirSync(OUT, { recursive: true });
  for (const [lang, text] of Object.entries(files)) {
    const target = path.join(OUT, `${lang}.ts`);
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    if (current === text) continue;
    stale = true;
    if (!check) fs.writeFileSync(target, text);
    console.log(`${check ? "stale" : "wrote"} ${path.relative(ROOT, target)}`);
  }
  if (check && stale) process.exit(1);
}
