import { clipDescription, type ShareKind } from "./share-link.ts";

/**
 * Build-time catalogue of the PUBLIC content that gets a static share page
 * (`/share/<kind>/<key>/`). It is read with the anon key over PostgREST, so RLS
 * applies on top — and the visibility conditions of `public.feed_page` are also
 * written out explicitly (published/public, not a draft, not deleted) so a
 * private or draft row can never reach a page's meta tags even if a policy
 * were loosened.
 *
 * The catalogue is best-effort: a failed request must NEVER fail `next build`
 * (and with it the deploy), so every source degrades to "no pages for this
 * kind" and the share link still works through the 404 forwarder.
 */
export interface ShareEntry {
  kind: ShareKind;
  /** `id` for content, `username` for profiles. */
  key: string;
  title: string;
  description: string;
}

interface ShareSource {
  kind: ShareKind;
  table: string;
  keyColumn: string;
  titleColumn: string;
  descriptionColumn: string;
  /** PostgREST filters, `column=op.value`. */
  filters: string[];
}

export const SHARE_SOURCES: readonly ShareSource[] = [
  {
    kind: "prompt",
    table: "prompts",
    keyColumn: "id",
    titleColumn: "title",
    descriptionColumn: "description",
    filters: ["status=eq.published", "visibility=eq.public", "community_id=is.null", "deleted_at=is.null", "or=(origin_type.eq.original,show_on_profile.is.true)"],
  },
  {
    kind: "request",
    table: "prompt_requests",
    keyColumn: "id",
    titleColumn: "title",
    descriptionColumn: "description",
    filters: ["is_draft=eq.false", "visibility=eq.public", "community_id=is.null", "deleted_at=is.null"],
  },
  {
    kind: "workflow",
    table: "workflows",
    keyColumn: "id",
    titleColumn: "title",
    descriptionColumn: "description",
    filters: ["status=eq.published", "visibility=eq.public", "community_id=is.null"],
  },
  {
    kind: "preset",
    table: "presets",
    keyColumn: "id",
    titleColumn: "title",
    descriptionColumn: "description",
    filters: ["status=eq.published", "visibility=eq.public", "community_id=is.null"],
  },
  {
    kind: "profile",
    table: "profiles",
    keyColumn: "username",
    titleColumn: "display_name",
    descriptionColumn: "bio",
    filters: [],
  },
];

const PAGE_SIZE = 1000;

/** PostgREST URL for one page of one source (pure — tested). */
export function buildCatalogUrl(baseUrl: string, source: ShareSource, offset: number, limit = PAGE_SIZE): string {
  const select = [source.keyColumn, source.titleColumn, source.descriptionColumn].join(",");
  const parts = [`select=${select}`, ...source.filters, `order=${source.keyColumn}.asc`, `limit=${limit}`, `offset=${offset}`];
  return `${baseUrl.replace(/\/+$/, "")}/rest/v1/${source.table}?${parts.join("&")}`;
}

/** Maps raw rows to entries, dropping rows without a key or a title (pure — tested). */
export function mapCatalogRows(source: ShareSource, rows: unknown): ShareEntry[] {
  if (!Array.isArray(rows)) return [];
  const entries: ShareEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const key = record[source.keyColumn];
    const title = record[source.titleColumn];
    const description = record[source.descriptionColumn];
    if (typeof key !== "string" || !key || typeof title !== "string" || !title.trim()) continue;
    entries.push({
      kind: source.kind,
      key,
      title: clipDescription(title, 120),
      description: clipDescription(typeof description === "string" ? description : "", 200),
    });
  }
  return entries;
}

async function fetchSource(baseUrl: string, anonKey: string, source: ShareSource): Promise<ShareEntry[]> {
  const entries: ShareEntry[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetch(buildCatalogUrl(baseUrl, source, offset), {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`${source.table}: HTTP ${response.status}`);
    const rows: unknown = await response.json();
    const page = mapCatalogRows(source, rows);
    entries.push(...page);
    if (!Array.isArray(rows) || rows.length < PAGE_SIZE) return entries;
  }
}

let catalogPromise: Promise<ShareEntry[]> | null = null;

/** The public-content catalogue, memoised for the whole build (generateStaticParams, generateMetadata and the sitemap all read it). */
export function getShareCatalog(): Promise<ShareEntry[]> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!baseUrl || !anonKey) return [];
      const results = await Promise.all(
        SHARE_SOURCES.map((source) =>
          fetchSource(baseUrl, anonKey, source).catch((err: unknown) => {
            console.warn(`[share-catalog] ${source.kind} skipped:`, err instanceof Error ? err.message : err);
            return [] as ShareEntry[];
          }),
        ),
      );
      return results.flat();
    })();
  }
  return catalogPromise;
}
