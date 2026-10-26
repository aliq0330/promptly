import type { AnchorHTMLAttributes } from "react";
import { withBasePath } from "@/lib/utils";

/**
 * A link that makes the browser LOAD the page (a real navigation) instead of Next's client-side route swap. Odak uses it
 * (docs/history/249-*): iOS Safari colours the strip behind its floating toolbar when a page LOADS — a reload of /focus
 * showed it dark, arriving by client-side navigation left it white — so Odak is entered as a page of its own.
 * Everything else keeps `next/link`.
 */
export function FullLoadLink({ href, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string }) {
  return <a href={withBasePath(href)} {...props} />;
}
