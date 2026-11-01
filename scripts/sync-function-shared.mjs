#!/usr/bin/env node
/**
 * Açık API çekirdeğini (`src/lib/public-api`) Edge Function'ların okuyabileceği yere kopyalar:
 * `supabase/functions/_shared/promptly/<src altındaki yol>`.
 *
 * Neden kopya: Supabase deploy'u yalnız `supabase/functions` klasörünü paketler; `src/`'den içe aktarma canlıda bulunamaz.
 * Kaynak TEK yerdir (`src/`); kopya elle düzenlenmez. `--check` farkı bulursa hata verir (`public-api-vendored.test.ts` ve CI çağırır).
 *
 * İKİNCİ kopya türü (`EXTRA_FILES`): internet üzerinden çalışan MCP'nin sunucu tanımı (`mcp/src/server.ts`, `remote.ts`) `supabase/functions/mcp/`
 * altına kopyalanır; tek fark içe aktarma yolları (`../../src/…` → `../_shared/promptly/…`) ve bir başlık satırıdır. Bu dosyaların paket
 * (npm) içe aktarmaları (`@modelcontextprotocol/sdk/…`, `zod`) yalnız izinli listedeki adlardır; Deno'da `supabase/functions/mcp/deno.json` çözer.
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

/** [kaynak, hedef] — repo köküne göre. Hedef klasörde elle yazılmış dosyalar da vardır (index.ts, deno.json); yalnız bunlar üretilir. */
const EXTRA_FILES = [
  ["mcp/src/server.ts", "supabase/functions/mcp/server.ts"],
  ["mcp/src/remote.ts", "supabase/functions/mcp/remote.ts"],
];
const EXTRA_PACKAGE_IMPORTS = [/^@modelcontextprotocol\/sdk\/[\w./-]+\.js$/, /^zod$/];

function extraContent(from, text, vendoredFiles) {
  for (const match of text.matchAll(IMPORT_PATTERN)) {
    const spec = match[1];
    if (spec.startsWith("../../src/")) {
      if (!vendoredFiles.includes(spec.slice("../../src/".length))) throw new Error(`${from}: "${spec}" is not part of the vendored core.`);
    } else if (spec.startsWith("./")) {
      if (!EXTRA_FILES.some(([source]) => source.endsWith(`/${spec.slice(2).replace(/\.ts$/, "")}.ts`))) throw new Error(`${from}: "${spec}" is not vendored with it.`);
    } else if (!EXTRA_PACKAGE_IMPORTS.some((pattern) => pattern.test(spec))) {
      throw new Error(`${from}: import "${spec}" is not on the allowed package list (Deno import map).`);
    }
  }
  const rewritten = text.replace(/(["'])\.\.\/\.\.\/src\//g, "$1../_shared/promptly/");
  return `// Üretilmiş kopya (${from}) — elle düzenleme: \`node scripts/sync-function-shared.mjs\`. Ayrıntı: docs/history/299-*.\n${rewritten}`;
}

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
  for (const [from, to] of EXTRA_FILES) {
    const target = join(ROOT, to);
    const expected = extraContent(from, readFileSync(join(ROOT, from), "utf8"), files);
    if (!existsSync(target)) problems.push(`missing: ${to}`);
    else if (readFileSync(target, "utf8") !== expected) problems.push(`stale: ${to}`);
  }
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
  for (const [from, to] of EXTRA_FILES) {
    mkdirSync(dirname(join(ROOT, to)), { recursive: true });
    writeFileSync(join(ROOT, to), extraContent(from, readFileSync(join(ROOT, from), "utf8"), files));
  }
  console.log(`Copied ${files.length} files to ${relative(ROOT, VENDOR_DIR)} and ${EXTRA_FILES.length} MCP files to supabase/functions/mcp`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const problems = diff();
    if (problems.length > 0) {
      console.error(`The vendored Edge Function copies (supabase/functions/_shared/promptly, supabase/functions/mcp) are out of date:\n  ${problems.join("\n  ")}\nRun: node scripts/sync-function-shared.mjs`);
      process.exit(1);
    }
    console.log("Vendored Edge Function copies are up to date.");
  } else {
    write();
  }
}
