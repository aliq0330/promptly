"use client";

import { useEffect } from "react";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { absoluteUrl } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Body of a static share page (`/share/<kind>/<key>/`). Crawlers read the
 * page's own title/description from its `<head>`; a person landing here is
 * sent straight on to the real detail page, with a visible link as a fallback
 * (and for anyone with scripting disabled).
 */
export function ShareRedirect({ href, title, description }: { href: string; title: string; description: string }) {
  const { t } = useTranslation();

  useEffect(() => {
    window.location.replace(absoluteUrl(href));
  }, [href]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-h2 text-text break-words">{title}</h1>
      {description && <p className="text-small text-text-muted break-words">{description}</p>}
      <p className="text-small text-text-muted" role="status">
        {t("share.pageOpening")}
      </p>
      <Link href={href} className={buttonClassName({ size: "md" })}>
        {t("share.pageOpen")}
      </Link>
    </main>
  );
}
