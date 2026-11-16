#!/usr/bin/env node
// Tasarım sistemi ölçümü (docs/history/403-*): kural dışı kalıpları `src/` altında sayar. Yalnız okur, hiçbir dosyayı değiştirmez.
//   node scripts/design-metrics.mjs            → tablo
//   node scripts/design-metrics.mjs --json     → JSON
//   node scripts/design-metrics.mjs --check    → hedefi aşan sayaç varsa çıkış kodu 1 (CI kilidi)
// `target` her sayaç için izin verilen en çok sayıdır; bilinçli istisnalar `allow` dosyalarındadır ve sayılmaz.
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = walk(ROOT).map((file) => ({ file, rel: path.relative(ROOT, file), text: fs.readFileSync(file, "utf8") }));

// Sınıf adı kalıpları. `allow`: sayılmayan dosya parçaları (bilinçli istisna).
const METRICS = [
  { key: "textMicro", label: "11px metin (text-micro)", re: /(^|[^\w-])text-micro(?![\w-])/g, allow: ["components/ui/badge.tsx"], target: 0 },
  { key: "uppercase", label: "büyük harfli etiket (uppercase)", re: /(^|[^\w-])uppercase(?![\w-])/g, allow: [], target: 0 },
  { key: "tracking", label: "açık harf aralığı (tracking-[0.0…em], wide)", re: /(^|[^\w-])tracking-(\[0?\.\d+em\]|wide|wider|widest)(?![\w-])/g, allow: [], target: 0 },
  { key: "iconSizeOffScale", label: "ölçek dışı ikon boyutu", re: /\bsize=\{(10|11|13|14|15|17|18|19|22|26|28)\}/g, allow: [], target: 0 },
  { key: "arbitraryText", label: "elle metin boyutu text-[…]", re: /(^|[^\w-])text-\[[0-9.]+(px|rem)\]/g, allow: [], target: 0 },
  { key: "arbitraryRadius", label: "elle radius rounded-[…]", re: /(^|[^\w-])rounded(-[trbl]{1,2})?-\[(?![^\]]*cqw)[^\]]+\]/g, allow: [], target: 0 },
  { key: "cardSurface", label: "elle yazılmış kart yüzeyi", re: /rounded-(md|lg|xl) border border-border(-soft)? bg-(surface|background|surface-soft)(?![\w-])/g, allow: ["components/ui/card.tsx"], target: 0 },
  { key: "shadowPop", label: "shadow-pop (yüzen katman dışı)", re: /(^|[^\w-])shadow-pop(?![\w-])/g, allow: ["components/ui/floating.ts", "components/ui/modal.tsx", "components/ui/menu.tsx"], target: null },
  { key: "transitionAll", label: "transition-all", re: /(^|[^\w-])transition-all(?![\w-])/g, allow: [], target: 0 },
  { key: "hoverScale", label: "hover:scale-*", re: /hover:scale-\d+/g, allow: [], target: 0 },
  { key: "rawSwitch", label: 'role="switch" (Switch dışında)', re: /role="switch"/g, allow: ["components/ui/switch.tsx"], target: 0 },
  { key: "statusAlpha", label: "durum rengi alfa zemin (bg-*/10|12|15)", re: /bg-(success|warning|danger)\/(10|12|15)(?![\w-])/g, allow: [], target: 0 },
  { key: "textWhite", label: "sabit text-white", re: /(^|[^\w-])text-white(\/\d+)?(?![\w-])/g, allow: ["features/stories/", "features/focus/"], target: null },
  { key: "backdropBlur", label: "backdrop-blur", re: /(^|[^\w-])backdrop-blur[\w-]*/g, allow: ["components/ui/modal.tsx", "components/ui/media-play-button.tsx", "features/focus/", "features/stories/", "features/messages/"], target: null },
  { key: "zArbitrary", label: "ham z-[…]", re: /(^|[^\w-])z-\[\d+\]/g, allow: [], target: 0 },
  { key: "fontBoldSmall", label: "12–13px metinde font-bold/extrabold", re: /text-(caption|label|micro)[^"'`]*\bfont-(bold|extrabold)\b|\bfont-(bold|extrabold)\b[^"'`]*text-(caption|label|micro)/g, allow: [], target: 0 },
  { key: "hexInTsx", label: "elle hex renk", re: /#[0-9a-fA-F]{6}\b/g, allow: ["features/auth/google-sign-in-button.tsx", "features/spaces/tabs/palette-tab.tsx", "features/prompts/variable-spec-editor.tsx", "features/presets/preset-field-input.tsx"], target: 0 },
];

const result = METRICS.map((metric) => {
  let total = 0;
  const per = {};
  for (const { rel, text } of files) {
    if (metric.allow.some((prefix) => rel.startsWith(prefix))) continue;
    const matches = text.match(metric.re);
    if (matches) {
      total += matches.length;
      per[rel] = matches.length;
    }
  }
  return { key: metric.key, label: metric.label, count: total, target: metric.target, files: Object.keys(per).length, top: Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 5) };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const pad = (value, width) => String(value).padEnd(width);
console.log(`${pad("sayaç", 44)}${pad("sayı", 7)}${pad("dosya", 7)}hedef`);
for (const row of result) console.log(`${pad(row.label, 44)}${pad(row.count, 7)}${pad(row.files, 7)}${row.target ?? "—"}`);
if (process.argv.includes("--top")) {
  for (const row of result.filter((r) => r.count > 0)) console.log(`\n${row.label}\n  ${row.top.map(([file, n]) => `${file} (${n})`).join("\n  ")}`);
}

if (process.argv.includes("--check")) {
  const over = result.filter((row) => row.target !== null && row.count > row.target);
  if (over.length > 0) {
    console.error(`\nHedefi aşan sayaçlar: ${over.map((row) => `${row.key}=${row.count} (hedef ${row.target})`).join(", ")}`);
    process.exit(1);
  }
}
