import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = "https://aliq0330.github.io/promptly";

// Only the stable list pages: detail pages are `?id=` routes of one static
// shell, so they cannot be enumerated at build time.
const PATHS = ["", "discover", "prompts", "requests", "workflows", "presets", "tags", "studio", "privacy", "terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({ url: `${BASE}/${path ? `${path}/` : ""}` }));
}
