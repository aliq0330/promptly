import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Design-system guard rails (docs/history/406-*): the semantic scale in `globals.css` is the only scale. Every rule below is an ERROR — each had zero
 * violations when it was made one (`scripts/design-metrics.mjs` counts the same patterns, `scripts/design-metrics.test.mjs` runs it in `npm test`).
 * `skip` lists the files where a rule does not apply on purpose (the count badge owns `text-micro`; authored stories use their own tokens).
 */
const FORBIDDEN_CLASSES = [
  { key: "textScale", re: /(^|[^\w-])text-(sm|xs|base)(?![\w-])/, message: "Tailwind varsayılan yazı ölçeği yerine text-small / text-caption / text-body kullan (globals.css)." },
  { key: "radiusScale", re: /(^|[^\w-])rounded(-[trbl]{1,2})?-(2xl|3xl)(?![\w-])/, message: "rounded-2xl = rounded-lg; rounded-3xl yerine rounded-xl kullan (radius ölçeği)." },
  { key: "dvh", re: /(^|[^\w-])(min-|max-)?h-\[[^\]]*\d(?<!d)vh\]/, message: "vh yerine dvh kullan (mobil tarayıcı çubuğu)." },
  { key: "foregroundTokens", re: /(^|[^\w-])text-white(?![\w/-])[^"'`]*(^|[^\w-])bg-(danger|secondary|success|warning)(?![\w-])|(^|[^\w-])bg-(danger|secondary|success|warning)(?![\w/-])[^"'`]*(^|[^\w-])text-white(?![\w/-])/, message: "Durum rengi zemininde text-white yerine text-*-foreground kullan (kontrast)." },
  { key: "spacing", re: /(^|[^\w-])(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-3\.5(?![\w.])|(^|[^\w-])(gap|gap-x|gap-y|space-x|space-y)-2\.5(?![\w.])/, message: "Boşluk ölçeği: 3.5 yerine 4 (ya da 3), gap-2.5 yerine gap-3 kullan; 0.5/1.5/2.5 yalnız ikon hizası/rozet için." },
  { key: "textMicro", re: /(^|[^\w-])text-micro(?![\w-])/, message: "11px metin yalnız CountBadge'de (components/ui/badge.tsx): okunan metin için text-caption kullan.", skip: ["src/components/ui/badge.tsx"] },
  { key: "uppercase", re: /(^|[^\w-])uppercase(?![\w-])/, message: "Büyük harfli etiket yok: SectionLabel (12px/600, cümle düzeni) kullan." },
  { key: "tracking", re: /(^|[^\w-])tracking-(\[0?\.\d+em\]|wide|wider|widest)(?![\w-])/, message: "Açık harf aralığı yok (yalnız büyük başlıklarda negatif aralık)." },
  { key: "transitionAll", re: /(^|[^\w-])transition-all(?![\w-])/, message: "transition-all yerine adlandırılmış geçiş (transition-colors, transition-[transform,opacity])." },
  { key: "hoverScale", re: /hover:scale-\d+/, message: "Hover'da ölçek değişimi yok: yüzey rengi ya da halka kullan." },
  { key: "arbitraryText", re: /(^|[^\w-])text-\[[0-9.]+(px|rem)\]/, message: "Elle yazı boyutu yok: text-caption / label / small / body / h3 / h2 / h1 / display / display-xl." },
  { key: "arbitraryRadius", re: /(^|[^\w-])rounded(-[trbl]{1,2})?-\[(?![^\]]*(cqw|%))[^\]]+\]/, message: "Elle radius yok: rounded-2xs/xs/sm/md/lg/xl/full (kaba oranlı cqw/% serbest)." },
  { key: "zIndex", re: /(^|[^\w-])z-\[\d+\]/, message: "Ham z-[…] yok: z-(--z-…) katman token'ı (globals.css) ya da kart içi z-1/2/3." },
  { key: "statusAlpha", re: /bg-(success|warning|danger)\/(10|12|15)(?![\w-])/, message: "Durum zemininde alfa yok: bg-success-soft / warning-soft / danger-soft." },
  { key: "cardSurface", re: /rounded-(md|lg|xl) border border-border(-soft)? bg-(surface|background|surface-soft)(?![\w/-])/, message: "Kart yüzeyi elle yazılmaz: <Card tone padding> ya da card-flat / card-soft / card-inset (globals.css)." , skip: ["src/components/ui/card.tsx"] },
  { key: "textWhite", re: /(^|[^\w-])text-white(\/\d+)?(?![\w-])/, message: "Resim/koyu sahne üstü metin: text-on-art / text-on-art-muted / text-on-art-faint.", skip: ["src/features/stories/**"] },
];
const classRules = (skipPath) =>
  FORBIDDEN_CLASSES.filter((rule) => !(rule.skip ?? []).some((pattern) => pattern === skipPath)).flatMap(({ re, message }) => {
    const source = re.source.replace(/(?<!\\)\//g, "\\/");
    return [
      { selector: `Literal[value=/${source}/]`, message },
      { selector: `TemplateElement[value.raw=/${source}/]`, message },
    ];
  });
const SWITCH_RULE = { selector: "JSXAttribute[name.name='role'][value.value='switch']", message: "Switch elle yazılmaz: components/ui/switch.tsx (Switch / SwitchRow)." };
const skipFiles = [...new Set(FORBIDDEN_CLASSES.flatMap((rule) => rule.skip ?? []))];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/lib/**", ...skipFiles, "src/components/ui/switch.tsx"],
    rules: { "no-restricted-syntax": ["error", ...classRules(null), SWITCH_RULE] },
  },
  // Kuralın bilerek uygulanmadığı dosyalar: yalnız o kural çıkarılır, geri kalanı sürer.
  ...skipFiles.map((pattern) => ({
    files: [pattern],
    rules: { "no-restricted-syntax": ["error", ...classRules(pattern), SWITCH_RULE] },
  })),
  {
    files: ["src/components/ui/switch.tsx"],
    rules: { "no-restricted-syntax": ["error", ...classRules(null)] },
  },
// Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MCP paketi: kendi bağımlılıkları/derlemesi (`mcp/`); üretilmiş tek dosyalık paket lint edilmez.
    "mcp/dist/**",
    // Chrome uzantısı: bağımsız klasik betikler (tarayıcı globalleri, kendi testleri); Next/React kuralları uygulanmaz.
    "promptly-extension/**",
    // Yerel ajan becerileri (.claude/skills/…): proje kaynağı değil.
    ".claude/**",
    "mcp/node_modules/**",
  ]),
]);

export default eslintConfig;
