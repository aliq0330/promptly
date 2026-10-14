import type { MetadataRoute } from "next";
import { getShareCatalog } from "@/lib/share-catalog";
import { sharePathFor } from "@/lib/share-link";

export const dynamic = "force-static";

const BASE = "https://aliq0330.github.io/promptly";

// The stable list pages, plus the static share page of every public item
// (detail pages themselves are `?id=` routes of one static shell, which cannot
// be enumerated; the share pages carry each item's own title/description).
const PATHS = ["", "discover", "prompts", "requests", "workflows", "presets", "tags", "studio", "privacy", "terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = PATHS.map((path) => ({ url: `${BASE}/${path ? `${path}/` : ""}` }));
  const shared = (await getShareCatalog()).map((entry) => ({ url: `${BASE}${sharePathFor(entry.kind, entry.key)}` }));
  return [...pages, ...shared];
}
