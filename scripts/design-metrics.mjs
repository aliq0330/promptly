#!/usr/bin/env node
// Tasarım sistemi ölçümü (docs/history/406-*): kural dışı kalıpları `src/` altında sayar. Yalnız okur, hiçbir dosyayı değiştirmez.
//   node scripts/design-metrics.mjs            → tablo
//   node scripts/design-metrics.mjs --top      → en çok ihlal eden dosyalar da
//   node scripts/design-metrics.mjs --json     → JSON
//   node scripts/design-metrics.mjs --check    → hedefi aşan sayaç varsa çıkış kodu 1 (CI kilidi; `scripts/design-metrics.test.mjs` da aynısını `npm test`'te koşar)
// `target` her sayaç için izin verilen en çok sayıdır; bilinçli istisnalar `allow` dosyalarındadır ve sayılmaz.
import { loadFiles, jsxTags, isNotIcon, iconSizeOk, stringsWithTag } from "./design-metrics-lib.mjs";

const files = loadFiles();

const className = (key, label, re, { allow = [], target = 0, tsxOnly = false } = {}) => ({ key, label, allow, target, tsxOnly, count: (text) => (text.match(re) ?? []).length });

const METRICS = [
  className("textMicro", "11px metin (text-micro)", /(^|[^\w-])text-micro(?![\w-])/g, { allow: ["components/ui/badge.tsx"] }),
  className("uppercase", "büyük harfli etiket (uppercase)", /(^|[^\w-])uppercase(?![\w-])/g),
  className("tracking", "açık harf aralığı (tracking-[0.0…em], wide)", /(^|[^\w-])tracking-(\[0?\.\d+em\]|wide|wider|widest)(?![\w-])/g),
  {
    key: "iconSizeOffScale",
    label: "ölçek dışı ikon boyutu (12/16/20/24, süs ≥32 ×4)",
    allow: [],
    target: 0,
    count: (text) => jsxTags(text).filter(([name, attrs]) => !isNotIcon(name) && [...attrs.matchAll(/\bsize=\{(\d+)\}/g)].some((m) => !iconSizeOk(Number(m[1])))).length,
  },
  {
    key: "iconStrokeWidth",
    label: "ikon bileşeninde strokeWidth",
    allow: ["components/icons/", "components/line-art/", "components/layout/brand-mark.tsx", "components/ui/motion-icons.tsx", "features/teams/board/", "features/spaces/board/", "features/workflows/workflow-flow-diagram.tsx", "features/relations/", "features/prompts/dna-constellation.tsx", "features/insights/"],
    target: 0,
    count: (text) => jsxTags(text).filter(([name, attrs]) => /^[A-Z]/.test(name) && /\bstrokeWidth=/.test(attrs)).length,
  },
  className("arbitraryText", "elle metin boyutu text-[…]", /(^|[^\w-])text-\[[0-9.]+(px|rem)\]/g),
  className("arbitraryRadius", "elle radius rounded-[…]", /(^|[^\w-])rounded(-[trbl]{1,2})?-\[(?![^\]]*(cqw|%))[^\]]+\]/g),
  className("cardSurface", "elle yazılmış kart yüzeyi", /rounded-(md|lg|xl) border border-border(-soft)? bg-(surface|background|surface-soft)(?![\w/-])/g, { allow: ["components/ui/card.tsx"] }),
  className("shadowPopPill", "yüzen hapta/kapakta shadow-pop", /rounded-full[^"'`]*shadow-pop|shadow-pop[^"'`]*rounded-full|(ART_FRAME_CLASS|lg:rounded-xl)[^"'`]*shadow-pop/g),
  className("transitionAll", "transition-all", /(^|[^\w-])transition-all(?![\w-])/g),
  className("hoverScale", "hover:scale-*", /hover:scale-\d+/g),
  className("rawSwitch", 'role="switch" (Switch dışında)', /role="switch"/g, { allow: ["components/ui/switch.tsx"] }),
  // Tek değer seçimi (docs/history/453-*): radyo yalnız ortak bileşenlerde (ChoiceGroup / OptionGroup / SwatchGroup / MenuRadioGroup); yıldız puanı ve kategori ağacı yaprağı bilinçli istisna.
  className("rawRadio", 'role="radio" / type="radio" (ortak seçim bileşenleri dışında)', /(?<!\[)\b(role|type)="radio"/g, {
    allow: ["components/ui/option-group.tsx", "components/ui/choice-group.tsx", "components/ui/swatch-group.tsx", "components/ui/menu-radio.tsx", "features/content/taxonomy-picker.tsx"],
    tsxOnly: true,
  }),
  className("statusAlpha", "durum rengi alfa zemin (bg-*/10|12|15)", /bg-(success|warning|danger)\/(10|12|15)(?![\w-])/g),
  className("zArbitrary", "ham z-[…]", /(^|[^\w-])z-\[\d+\]/g),
  className("fontBoldSmall", "12–13px metinde font-bold/extrabold", /text-(caption|label)[^"'`]*\bfont-(bold|extrabold)\b|\bfont-(bold|extrabold)\b[^"'`]*text-(caption|label)/g),
  {
    key: "fontBoldOutsideDisplay",
    label: "font-bold/extrabold (başlık ya da font-display dışında)",
    allow: [],
    target: 0,
    count: (text) =>
      stringsWithTag(text).filter(({ str, tag }) => /(?<![\w-])font-(bold|extrabold)(?![\w-])/.test(str) && !["h1", "h2", "h3"].includes(tag ?? "") && !/font-display|(?<![\w-])text-(h1|h2|h3|display)(?![\w-])/.test(str)).length,
  },
  className("textWhite", "sabit text-white (sahne üstü: text-on-art)", /(^|[^\w-])text-white(\/\d+)?(?![\w-])/g, { allow: ["features/stories/"] }),
  className("backdropBlur", "backdrop-blur (modal/medya/Odak/mesaj katmanı dışı)", /(^|[^\w-])backdrop-blur[\w-]*/g, { allow: ["components/ui/modal.tsx", "components/ui/media-play-button.tsx", "features/focus/", "features/stories/", "features/messages/"] }),
  {
    key: "controlHeight",
    label: "elle kontrol yüksekliği h-7/h-8 (button/input/Link)",
    allow: ["features/spaces/board/", "features/teams/board/"],
    target: 0,
    count: (text) => jsxTags(text).filter(([name, attrs]) => ["button", "input", "select", "textarea", "Link", "a"].includes(name) && /(?<![\w-])h-(7|8)(?![\w.\[-])/.test(attrs)).length,
  },
  className("hexInTsx", "elle hex renk", /#[0-9a-fA-F]{6}\b/g, { allow: ["features/auth/google-sign-in-button.tsx", "features/spaces/tabs/palette-tab.tsx", "features/prompts/variable-spec-editor.tsx", "features/presets/preset-field-input.tsx"], tsxOnly: true }),
];

const result = METRICS.map((metric) => {
  let total = 0;
  const per = {};
  for (const { rel, text } of files) {
    if (metric.allow.some((prefix) => rel.startsWith(prefix))) continue;
    if (metric.tsxOnly && !rel.endsWith(".tsx")) continue;
    const n = metric.count(text);
    if (n) {
      total += n;
      per[rel] = n;
    }
  }
  return { key: metric.key, label: metric.label, count: total, target: metric.target, files: Object.keys(per).length, top: Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 5) };
});

export { result };

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const pad = (value, width) => String(value).padEnd(width);
console.log(`${pad("sayaç", 58)}${pad("sayı", 7)}${pad("dosya", 7)}hedef`);
for (const row of result) console.log(`${pad(row.label, 58)}${pad(row.count, 7)}${pad(row.files, 7)}${row.target ?? "—"}`);
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
