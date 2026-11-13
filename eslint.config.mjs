import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Design-system guard rails (audit G2/G3/G8): the Tailwind default type scale and the duplicate / off-scale radii are not
 * used in the app — the semantic scale in `globals.css` is. Warnings (not errors) so a legacy string never blocks a build,
 * but `npm run lint` shows every regression.
 */
const FORBIDDEN_CLASSES = [
  [/(^|[^\w-])text-(sm|xs|base)(?![\w-])/, "Tailwind varsayılan yazı ölçeği yerine text-small / text-caption / text-body kullan (globals.css)."],
  [/(^|[^\w-])rounded(-[trbl]{1,2})?-(2xl|3xl)(?![\w-])/, "rounded-2xl = rounded-lg; rounded-3xl yerine rounded-xl kullan (radius ölçeği)."],
  [/(^|[^\w-])text-\[(\d|1[01])(\.\d+)?px\]/, "12px altı metin: text-micro (yalnız sayaç rozeti) ya da text-caption kullan."],
  [/(^|[^\w-])(min-|max-)?h-\[[^\]]*\d(?<!d)vh\]/, "vh yerine dvh kullan (mobil tarayıcı çubuğu)."],
  [/(^|[^\w-])text-white(?![\w/-])[^"'`]*(^|[^\w-])bg-(danger|secondary|success|warning)(?![\w-])|(^|[^\w-])bg-(danger|secondary|success|warning)(?![\w/-])[^"'`]*(^|[^\w-])text-white(?![\w/-])/, "Durum rengi zemininde text-white yerine text-*-foreground kullan (kontrast)."],
  [/(^|[^\w-])(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-3\.5(?![\w.])|(^|[^\w-])(gap|gap-x|gap-y|space-x|space-y)-2\.5(?![\w.])/, "Boşluk ölçeği: 3.5 yerine 4 (ya da 3), gap-2.5 yerine gap-3 kullan; 0.5/1.5/2.5 yalnız ikon hizası/rozet için."],
];
const classRules = FORBIDDEN_CLASSES.flatMap(([re, message]) => {
  const pattern = re.source.replace(/\\/g, "\\\\");
  return [
    { selector: `Literal[value=/${re.source.replace(/\//g, "\\/")}/]`, message },
    { selector: `TemplateElement[value.raw=/${re.source.replace(/\//g, "\\/")}/]`, message },
  ].map((rule) => ({ ...rule, _p: pattern }));
}).map(({ selector, message }) => ({ selector, message }));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/lib/**"],
    rules: { "no-restricted-syntax": ["warn", ...classRules] },
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
    "mcp/node_modules/**",
  ]),
]);

export default eslintConfig;
