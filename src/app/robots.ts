import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Account/settings pages are not worth indexing; everything else is public.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/promptly/settings/", "/promptly/messages/", "/promptly/notifications/", "/promptly/moderation/"],
    },
    sitemap: "https://aliq0330.github.io/promptly/sitemap.xml",
  };
}
