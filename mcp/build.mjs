/**
 * `dist/index.js` — tek dosyalık, çalışma zamanı bağımlılığı olmayan paket (MCP SDK + zod + açık API çekirdeği içine gömülür).
 *
 * Herkese açık Supabase adresi ve anon anahtar derleme anında gömülür (sitenin derlemesiyle AYNI değerler — `deploy.yml` secret'ları;
 * tarayıcıya zaten gidiyorlar). Service role ASLA. Değerler yoksa paket yine derlenir ama çalışırken ortam değişkeni ister.
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const url = process.env.PROMPTLY_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.PROMPTLY_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (/service_role|sb_secret_/i.test(anonKey) || (anonKey.startsWith("eyJ") && /service_role/.test(Buffer.from(anonKey.split(".")[1] ?? "", "base64").toString()))) {
  console.error("Refusing to embed a service role / secret key. Use the public anon (publishable) key.");
  process.exit(1);
}

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  minify: false,
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);" },
  define: {
    __PROMPTLY_SUPABASE_URL__: JSON.stringify(url),
    __PROMPTLY_SUPABASE_ANON_KEY__: JSON.stringify(anonKey),
    __PROMPTLY_MCP_VERSION__: JSON.stringify(pkg.version),
  },
});

console.log(`Built dist/index.js (v${pkg.version})${url && anonKey ? "" : " — WITHOUT an embedded Promptly address (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)"}`);
