// Chrome uzantısını (promptly-extension/) indirilebilir tek zip'e paketler: public/downloads/promptly-extension.zip.
// Ayarlar → Geliştirici → "Chrome uzantısı" kartı bu dosyayı sunar. `prebuild`/`predev` çalıştırır; zip repoya girmez (.gitignore).
// Zip tek bir üst klasör içerir (promptly-extension/) → açınca "Paketlenmemiş öğe yükle" için tek klasör çıkar. Çıktı kararlıdır
// (sıralı dosya listesi, sabit tarih): aynı içerik aynı baytlar.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const EXTENSION_DIR = path.join(ROOT, "promptly-extension");
export const OUT_FILE = path.join(ROOT, "public", "downloads", "promptly-extension.zip");
export const ZIP_ROOT = "promptly-extension";
const FIXED_TIME = new Date(Date.UTC(2026, 0, 1));
// Paketin parçası olmayanlar: testler, geliştirici notu, işletim sistemi artıkları.
const EXCLUDE = [/^tests(\/|$)/, /^README\.md$/, /(^|\/)\.DS_Store$/];

function walk(dir, base = "") {
  return fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    return e.isDirectory() ? walk(dir, rel) : [rel];
  });
}

export function listExtensionFiles(dir = EXTENSION_DIR) {
  return walk(dir).filter((f) => !EXCLUDE.some((re) => re.test(f))).sort();
}

export function buildExtensionZip({ dir = EXTENSION_DIR, out = OUT_FILE } = {}) {
  const files = {};
  for (const rel of listExtensionFiles(dir)) files[`${ZIP_ROOT}/${rel}`] = [new Uint8Array(fs.readFileSync(path.join(dir, rel))), { level: 9, mtime: FIXED_TIME }];
  const data = zipSync(files);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, data);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  return { out, bytes: data.length, files: Object.keys(files).length, version: manifest.version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = buildExtensionZip();
  console.log(`extension zip: v${r.version}, ${r.files} files, ${(r.bytes / 1024).toFixed(0)} KB → ${path.relative(ROOT, r.out)}`);
}
