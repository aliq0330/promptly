import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Must match `basePath` in next.config.ts: manifest URLs are not prefixed automatically.
const BASE = "/promptly";

// Installable web app only — there is deliberately no service worker (a stale cached build
// could not be shipped away), so the app needs a connection like the website does.
// Colors are the default palette (Sand, light); the live page chrome follows the chosen
// palette/mode through the `theme-color` meta that ThemeProvider keeps in sync.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE}/`,
    name: "Promptly",
    short_name: "Promptly",
    description: "AI promptlarını paylaşan, keşfeden ve yeniden kullanan topluluk platformu.",
    lang: "tr",
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    background_color: "#f7f3ed",
    theme_color: "#f7f3ed",
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Keşfet", url: `${BASE}/discover/` },
      { name: "Oluştur", url: `${BASE}/create/` },
    ],
  };
}
