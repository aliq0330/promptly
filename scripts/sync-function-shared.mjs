#!/usr/bin/env node
/**
 * Açık API çekirdeğini (`src/lib/public-api`) Edge Function'ların okuyabileceği yere kopyalar:
 * `supabase/functions/_shared/promptly/<src altındaki yol>`.
 *
 * Neden kopya: Supabase deploy'u yalnız `supabase/functions` klasörünü paketler; `src/`'den içe aktarma canlıda bulunamaz.
 * Kaynak TEK yerdir (`src/`); kopya elle düzenlenmez. `--check` farkı bulursa hata verir (`public-api-vendored.test.ts` ve CI çağırır).
 *
 * Kapsam kendiliğinden bulunur: giriş dosyasından başlayıp her GÖRELİ `import … from "./x.ts"` izlenir. Göreli olmayan bir içe aktarma
 * (`@/…`, paket adı) hata verir — çekirdek bağımlılıksız kalmalı, aksi hâlde Deno'da çalışmaz.
 *
 * Kullanım: `node scripts/sync-function-shared.mjs` (yazar) · `node scripts/sync-function-shared.mjs --check` (yalnız denetler)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const ENTRY = join(SRC, "lib/public-api/index.ts");
export const VENDOR_DIR = join(ROOT, "supabase/functions/_shared/promptly");
const README = "README.md";

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/g;

/** Girişten erişilen bütün dosyalar (`src`'ye göre yollar), sıralı. */
export function collectFiles(entry = ENTRY) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT_PATTERN)) {
      const spec = match[1];
      if (!spec.startsWith("./") && !spec.startsWith("../")) {
        throw new Error(`${relative(ROOT, file)}: non-relative import "${spec}" — the public API core must stay dependency-free.`);
      }
      if (!spec.endsWith(".ts")) throw new Error(`${relative(ROOT, file)}: import "${spec}" must end with .ts (Deno).`);
      const target = resolve(dirname(file), spec);
      if (!target.startsWith(SRC)) throw new Error(`${relative(ROOT, file)}: import "${spec}" leaves src/.`);
      stack.push(target);
    }
  }
  return [...seen].map((file) => relative(SRC, file)).sort();
}

function listVendored(dir = VENDOR_DIR, base = VENDOR_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listVendored(full, base);
    const rel = relative(base, full);
    return rel === README ? [] : [rel];
  });
}

const README_TEXT = `# Üretilmiş kopya — elle düzenleme

Bu klasör \`src/lib/public-api\` çekirdeğinin ve onun içe aktardığı saf dosyaların BİREBİR kopyasıdır (Edge Function \`api\` için;
Supabase deploy'u yalnız \`supabase/functions\`'ı paketler). Kaynağı değiştir, sonra \`node scripts/sync-function-shared.mjs\` çalıştır.
\`npm test\` kopya eskiyse kırılır. Ayrıntı: \`docs/history/297-*\`.
`;

/** Farklar: eksik/eskimiş/fazla dosyalar. */
export function diff() {
  const files = collectFiles();
  const problems = [];
  for (const rel of files) {
    const target = join(VENDOR_DIR, rel);
    if (!existsSync(target)) problems.push(`missing: ${rel}`);
    else if (readFileSync(target, "utf8") !== readFileSync(join(SRC, rel), "utf8")) problems.push(`stale: ${rel}`);
  }
  for (const rel of listVendored()) if (!files.includes(rel)) problems.push(`extra: ${rel}`);
  return problems;
}

function write() {
  const files = collectFiles();
  rmSync(VENDOR_DIR, { recursive: true, force: true });
  for (const rel of files) {
    const target = join(VENDOR_DIR, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(SRC, rel), "utf8"));
  }
  writeFileSync(join(VENDOR_DIR, README), README_TEXT);
  console.log(`Copied ${files.length} files to ${relative(ROOT, VENDOR_DIR)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const problems = diff();
    if (problems.length > 0) {
      console.error(`supabase/functions/_shared/promptly is out of date:\n  ${problems.join("\n  ")}\nRun: node scripts/sync-function-shared.mjs`);
      process.exit(1);
    }
    console.log("supabase/functions/_shared/promptly is up to date.");
  } else {
    write();
  }
}
