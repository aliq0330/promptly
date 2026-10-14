import type { Metadata } from "next";
import { ShareRedirect } from "@/features/share/share-redirect";
import { getShareCatalog } from "@/lib/share-catalog";
import { detailHrefFor, isShareKind, sharePathFor } from "@/lib/share-link";

const SITE_URL = "https://aliq0330.github.io/promptly";

type Params = { kind: string; id: string };

// Only the rows in the build-time catalogue have a page; a link for newer
// content is forwarded by the 404 page (`NotFoundForwarder`).
export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  const entries = await getShareCatalog();
  const params = entries.map((entry) => ({ kind: entry.kind, id: entry.key }));
  // A static export needs at least one param; when the catalogue is empty
  // (no network at build time) emit a harmless placeholder instead of failing the build.
  return params.length > 0 ? params : [{ kind: "prompt", id: "_" }];
}

async function findEntry({ kind, id }: Params) {
  if (!isShareKind(kind)) return null;
  const entries = await getShareCatalog();
  return entries.find((entry) => entry.kind === kind && entry.key === id) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const entry = await findEntry(await params);
  if (!entry) return { title: "Promptly", robots: { index: false } };

  const title = `${entry.title} · Promptly`;
  const url = `${SITE_URL}${sharePathFor(entry.kind, entry.key)}`;
  // Post media lives in PRIVATE buckets (signed URLs expire), so it cannot be an
  // og:image — every share page uses the site card; the title/description are the content's own.
  const image = `${SITE_URL}/og.png`;
  return {
    title,
    description: entry.description || undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "Promptly",
      title,
      description: entry.description || undefined,
      url,
      images: [{ url: image, width: 1200, height: 630, alt: "Promptly" }],
    },
    twitter: { card: "summary_large_image", title, description: entry.description || undefined, images: [image] },
  };
}

export default async function SharePage({ params }: { params: Promise<Params> }) {
  const resolved = await params;
  const entry = await findEntry(resolved);
  const href = entry ? detailHrefFor(entry.kind, entry.key) : "/";
  return <ShareRedirect href={href} title={entry?.title ?? "Promptly"} description={entry?.description ?? ""} />;
}
