import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
