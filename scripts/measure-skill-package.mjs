// Skill paketi limitlerini ölçer (docs/history/398-*): sınırdaki sentetik ZIP'leri üretir, `readSkillZip` + `validateSkillPackage` çekirdeğini (istemci ve Edge `skill-package` AYNI kodu çalıştırır)
// süre ve bellek açısından ölçer. Node'da çalışır (Deno/Edge'de değil): sayılar çekirdeğin CPU/bellek maliyetinin alt sınırıdır, Edge'deki duvar süresi ve bellek tavanı ayrıca denenmelidir.
// Kullanım: node scripts/measure-skill-package.mjs
import { zipSync } from "fflate";
import { readSkillZip } from "../src/lib/skills/zip.ts";
import { validateSkillPackage } from "../src/lib/skills/package-validate.ts";
import { SKILL_LIMITS } from "../src/lib/skills/limits.ts";

const enc = new TextEncoder();
const WORDS = ["skill", "rule", "prompt", "agent", "review", "design", "refactor", "context", "example", "output", "format", "step", "check", "write", "read", "test", "build", "plan", "model", "tool"];
function noise(size, seed) {
  // Gerçekçi metin: kelime havuzundan sözde-rastgele (sıkıştırma oranı gerçek Markdown'a yakın, ≈3-5x); geçerli UTF-8.
  const out = new Uint8Array(size);
  let x = seed >>> 0 || 1;
  let i = 0;
  while (i < size) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const word = WORDS[x % WORDS.length] + (x % 11 === 0 ? ".\n" : " ");
    for (let k = 0; k < word.length && i < size; k += 1) out[i++] = word.charCodeAt(k);
  }
  return out;
}
function build(label, files) {
  const entries = { "SKILL.md": enc.encode("# Ölçüm\n") };
  for (const [name, bytes] of files) entries[name] = bytes;
  return { label, zip: zipSync(entries, { level: 6 }) };
}
const cases = [
  build("100 küçük dosya", Array.from({ length: SKILL_LIMITS.maxFiles - 1 }, (_, i) => [`rules/f${i}.md`, noise(2000, i + 1)])),
  build("sınırda tek büyük dosya", [["reference/big.md", noise(SKILL_LIMITS.maxFileBytes, 7)]]),
  build("toplam sınırı (çoklu büyük dosya)", Array.from({ length: Math.floor(SKILL_LIMITS.maxTotalBytes / SKILL_LIMITS.maxFileBytes) - 1 }, (_, i) => [`reference/b${i}.md`, noise(SKILL_LIMITS.maxFileBytes, 100 + i)])),
  build("yüksek oranlı sıkıştırma (bomba benzeri, reddedilmeli)", [["reference/zeros.md", new Uint8Array(SKILL_LIMITS.maxFileBytes).fill(97)]]),
];
console.log(`limitler: zip ${SKILL_LIMITS.maxZipBytes}, toplam ${SKILL_LIMITS.maxTotalBytes}, dosya ${SKILL_LIMITS.maxFileBytes}, adet ${SKILL_LIMITS.maxFiles}`);
for (const { label, zip } of cases) {
  global.gc?.();
  const before = process.memoryUsage().rss;
  const t0 = performance.now();
  const read = readSkillZip(zip);
  const report = validateSkillPackage(read.files.filter((file) => file.path !== "SKILL.md"));
  const ms = performance.now() - t0;
  const rssMb = (process.memoryUsage().rss - before) / 1048576;
  const codes = [...new Set([...read.issues, ...report.issues].map((issue) => issue.code))].join(",") || "-";
  console.log(`${label} [sorun kodları: ${codes}]: zip ${(zip.length / 1048576).toFixed(2)} MB → ${read.files.length} dosya, ${ms.toFixed(0)} ms, +${rssMb.toFixed(0)} MB RSS, okuma sorunu ${read.issues.length}, doğrulama ${report.ok ? "ok" : "hata"}`);
}
